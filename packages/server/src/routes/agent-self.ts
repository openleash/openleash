import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  ActionRequestSchema,
  readState,
  writeState,
  readApprovalRequestFile,
  writeApprovalRequestFile,
  appendAuditEvent,
  computeActionHash,
  NonceCache,
} from '@openleash/core';
import type {
  OpenleashConfig,
  AgentFrontmatter,
  StateAgentEntry,
  ApprovalRequestFrontmatter,
} from '@openleash/core';
import { createAgentAuth } from '../middleware/agent-auth.js';

export function registerAgentSelfRoutes(
  app: FastifyInstance,
  dataDir: string,
  config: OpenleashConfig,
  nonceCache: NonceCache
) {
  const agentAuth = createAgentAuth(config, dataDir, nonceCache);

  // GET /v1/agent/self
  app.get('/v1/agent/self', { preHandler: agentAuth }, async (request) => {
    const agent = (request as unknown as Record<string, unknown>).agentPrincipal as AgentFrontmatter;
    return {
      agent_principal_id: agent.agent_principal_id,
      agent_id: agent.agent_id,
      owner_principal_id: agent.owner_principal_id,
      status: agent.status,
      attributes: agent.attributes,
      created_at: agent.created_at,
    };
  });

  // POST /v1/agent/approval-requests
  app.post('/v1/agent/approval-requests', { preHandler: agentAuth }, async (request, reply) => {
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;
    const agent = (request as unknown as Record<string, unknown>).agentPrincipal as AgentFrontmatter;

    const body = request.body as {
      decision_id: string;
      action: unknown;
      justification?: string;
      context?: Record<string, unknown>;
    };

    if (!body.decision_id || !body.action) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'decision_id and action are required' },
      });
      return;
    }

    // Validate action
    const parseResult = ActionRequestSchema.safeParse(body.action);
    if (!parseResult.success) {
      reply.code(400).send({
        error: {
          code: 'INVALID_ACTION_REQUEST',
          message: 'Invalid action request',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const action = parseResult.data;
    const actionHash = computeActionHash(action);
    const approvalRequestId = crypto.randomUUID();
    const now = new Date();
    const requestTtl = config.approval?.request_ttl_seconds ?? 86400;
    const expiresAt = new Date(now.getTime() + requestTtl * 1000);

    const req: ApprovalRequestFrontmatter = {
      approval_request_id: approvalRequestId,
      decision_id: body.decision_id,
      agent_principal_id: agentEntry.agent_principal_id,
      agent_id: agent.agent_id,
      owner_principal_id: agentEntry.owner_principal_id,
      action_type: action.action_type,
      action_hash: actionHash,
      action,
      justification: body.justification ?? null,
      context: body.context ?? null,
      status: 'PENDING',
      approval_token: null,
      approval_token_expires_at: null,
      resolved_at: null,
      resolved_by: null,
      denial_reason: null,
      consumed_at: null,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    writeApprovalRequestFile(dataDir, req);

    // Update state
    const state = readState(dataDir);
    if (!state.approval_requests) state.approval_requests = [];
    state.approval_requests.push({
      approval_request_id: approvalRequestId,
      owner_principal_id: agentEntry.owner_principal_id,
      agent_principal_id: agentEntry.agent_principal_id,
      status: 'PENDING',
      path: `./approval-requests/${approvalRequestId}.md`,
    });
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'APPROVAL_REQUEST_CREATED', {
      approval_request_id: approvalRequestId,
      agent_id: agent.agent_id,
      agent_principal_id: agentEntry.agent_principal_id,
      owner_principal_id: agentEntry.owner_principal_id,
      action_type: action.action_type,
    });

    return {
      approval_request_id: approvalRequestId,
      status: 'PENDING',
      expires_at: expiresAt.toISOString(),
    };
  });

  // GET /v1/agent/approval-requests/:id
  app.get('/v1/agent/approval-requests/:id', { preHandler: agentAuth }, async (request, reply) => {
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;
    const { id } = request.params as { id: string };

    const state = readState(dataDir);
    const entry = (state.approval_requests ?? []).find(
      (r) => r.approval_request_id === id && r.agent_principal_id === agentEntry.agent_principal_id
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Approval request not found' },
      });
      return;
    }

    try {
      const req = readApprovalRequestFile(dataDir, id);
      return {
        approval_request_id: req.approval_request_id,
        status: req.status,
        action_type: req.action_type,
        action_hash: req.action_hash,
        justification: req.justification,
        created_at: req.created_at,
        expires_at: req.expires_at,
        resolved_at: req.resolved_at,
        denial_reason: req.denial_reason,
        // Only include approval_token if APPROVED
        ...(req.status === 'APPROVED' && {
          approval_token: req.approval_token,
          approval_token_expires_at: req.approval_token_expires_at,
        }),
      };
    } catch {
      reply.code(404).send({
        error: { code: 'FILE_NOT_FOUND', message: 'Approval request file not found' },
      });
    }
  });
}
