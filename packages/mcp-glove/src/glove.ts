import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult as SdkCallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildActionRequest } from './auth-client.js';
import { waitForApproval } from './approval-waiter.js';
import { log } from './logger.js';
import { ACTION_MAP, WRITE_TOOLS, buildPayload } from './profiles/office365-outlook.js';
import type {
  AuthClient,
  GloveConfig,
  GloveErrorPayload,
  ToolCallResult,
  UpstreamBridge,
} from './types.js';

/**
 * GloveServer wraps an upstream MCP server and enforces OpenLeash policy on
 * every tool call before forwarding to upstream.
 *
 * Transparency guarantee: the server name advertised to downstream clients
 * matches the upstream's logical name (e.g. "office365-outlook"), so agents
 * perceive no difference when glove is active.
 */
export class GloveServer {
  constructor(
    private readonly config: GloveConfig,
    private readonly upstream: UpstreamBridge,
    private readonly auth: AuthClient,
  ) {}

  // ─── Public handler methods (called by MCP server + directly in tests) ──────

  async handleListTools(): Promise<{ tools: unknown[] }> {
    return this.upstream.listTools();
  }

  /**
   * Core interception logic for tools/call.
   *
   * Decision matrix:
   *   ALLOW            → forward to upstream and return result
   *   DENY             → structured error, never reach upstream
   *   REQUIRE_APPROVAL → suspend, wait for owner decision, then ALLOW or error
   *   REQUIRE_STEP_UP  → treat as DENY for Phase-1 (not supported)
   *   REQUIRE_DEPOSIT  → treat as DENY for Phase-1 (not supported)
   *   Auth unavailable → fail-safe DENY for write tools
   */
  async handleCallTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const isWriteTool = WRITE_TOOLS.has(name);
    const actionType = ACTION_MAP[name];

    // ── Read-only / uncovered tool: passthrough without auth check ─────────
    if (!isWriteTool || !actionType) {
      // TODO(Phase-2): flag uncovered tools globally
      log('debug', 'Passthrough (read-only or uncovered tool)', { tool: name });
      return this.upstream.callTool(name, args);
    }

    // ── Build the OpenLeash action request ──────────────────────────────────
    const payload = buildPayload(name, args);
    const action = buildActionRequest({
      actionType,
      payload,
      agentId: this.config.agentId,
      subjectId: this.config.subjectId,
    });

    // ── Policy check ────────────────────────────────────────────────────────
    let authResult;
    try {
      authResult = await this.auth.authorize(action);
    } catch (err) {
      // Auth service unavailable → fail-safe deny
      const errorMsg = err instanceof Error ? err.message : String(err);
      log('error', 'Auth check failed — denying (fail-safe)', {
        tool: name,
        action_type: actionType,
        error: errorMsg,
      });
      return buildErrorResult({
        code: 'OPENLEASH_AUTH_ERROR',
        message: 'OpenLeash authorization service unavailable',
        action_type: actionType,
        tool_name: name,
        error: errorMsg,
      });
    }

    log('info', 'Authorization decision', {
      tool: name,
      action_type: actionType,
      decision: authResult.result,
      action_id: authResult.action_id,
      decision_id: authResult.decision_id,
      reason: authResult.reason,
    });

    switch (authResult.result) {
      case 'ALLOW':
        return this.upstream.callTool(name, args);

      case 'DENY':
        return buildErrorResult({
          code: 'OPENLEASH_DENY',
          message: authResult.reason ?? 'Action denied by policy',
          action_type: actionType,
          tool_name: name,
          action_id: authResult.action_id,
        });

      case 'REQUIRE_APPROVAL': {
        // ── Suspension / wait loop ──────────────────────────────────────
        let waitResult;
        try {
          waitResult = await waitForApproval({
            auth: this.auth,
            decisionId: authResult.decision_id,
            action,
            toolName: name,
            actionType,
            timeoutMs: this.config.approvalTimeoutMs,
            pollIntervalMs: this.config.approvalPollIntervalMs,
          });
        } catch (err) {
          return buildErrorResult({
            code: 'OPENLEASH_AUTH_ERROR',
            message: 'Failed to create/poll approval request',
            action_type: actionType,
            tool_name: name,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        if (waitResult.outcome === 'TIMEOUT') {
          return buildErrorResult({
            code: 'OPENLEASH_APPROVAL_TIMEOUT',
            message: `Owner did not respond within ${this.config.approvalTimeoutMs}ms`,
            action_type: actionType,
            tool_name: name,
            approval_request_id: waitResult.approvalRequestId,
          });
        }

        if (waitResult.outcome === 'DENIED') {
          return buildErrorResult({
            code: 'OPENLEASH_APPROVAL_DENIED',
            message: 'Owner denied the approval request',
            action_type: actionType,
            tool_name: name,
            approval_request_id: waitResult.approvalRequestId,
          });
        }

        // outcome === 'APPROVED' — re-authorise with the approval token
        let approvedResult;
        try {
          approvedResult = await this.auth.authorize(action, waitResult.approvalToken);
        } catch (err) {
          return buildErrorResult({
            code: 'OPENLEASH_AUTH_ERROR',
            message: 'Failed to re-authorise after approval',
            action_type: actionType,
            tool_name: name,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        if (approvedResult.result !== 'ALLOW') {
          return buildErrorResult({
            code: 'OPENLEASH_DENY',
            message: approvedResult.reason ?? 'Re-authorization denied',
            action_type: actionType,
            tool_name: name,
            action_id: approvedResult.action_id,
          });
        }

        log('info', 'Approved — forwarding to upstream', {
          tool: name,
          action_type: actionType,
          action_id: approvedResult.action_id,
        });
        return this.upstream.callTool(name, args);
      }

      default:
        // REQUIRE_STEP_UP, REQUIRE_DEPOSIT → deny for Phase-1
        // TODO(Phase-2): support step-up auth and deposit flows
        log('warn', `Unsupported decision '${authResult.result}' — treating as DENY`, {
          tool: name,
          action_type: actionType,
        });
        return buildErrorResult({
          code: 'OPENLEASH_DENY',
          message: `Decision '${authResult.result}' is not supported in this version`,
          action_type: actionType,
          tool_name: name,
          action_id: authResult.action_id,
        });
    }
  }

  // ─── MCP server lifecycle ────────────────────────────────────────────────

  /**
   * Starts the glove as an MCP server on stdio.
   * The server advertises itself as `config.serverName` so the downstream
   * client perceives no change (transparency requirement).
   */
  async start(): Promise<void> {
    const server = new Server(
      { name: this.config.serverName, version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => this.handleListTools());

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      const args = (rawArgs ?? {}) as Record<string, unknown>;
      const result = await this.handleCallTool(name, args);
      return result as unknown as SdkCallToolResult;
    });

    server.onerror = (err) => {
      log('error', 'MCP server error', { error: err.message });
    };

    const transport = new StdioServerTransport();
    await server.connect(transport);

    log('info', 'mcp-glove started', {
      server_name: this.config.serverName,
      profile: this.config.profile,
      upstream_cmd: this.config.upstreamCmd,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildErrorResult(payload: GloveErrorPayload): ToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: true,
  };
}
