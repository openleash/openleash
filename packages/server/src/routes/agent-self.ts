import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  ActionRequestSchema,
  parsePolicyYaml,
  computeActionHash,
  NonceCache,
} from '@openleash/core';
import type {
  DataStore,
  OpenleashConfig,
  OpenleashEvents,
  AgentFrontmatter,
  StateAgentEntry,
  ApprovalRequestFrontmatter,
  PolicyDraftFrontmatter,
} from '@openleash/core';
import { createAgentAuth } from '../middleware/agent-auth.js';

export function registerAgentSelfRoutes(
  app: FastifyInstance,
  store: DataStore,
  config: OpenleashConfig,
  nonceCache: NonceCache,
  events: OpenleashEvents,
) {
  const agentAuth = createAgentAuth(config, store, nonceCache);

  // GET /v1/agent/self
  app.get('/v1/agent/self', { preHandler: agentAuth }, async (request) => {
    const agent = (request as unknown as Record<string, unknown>).agentPrincipal as AgentFrontmatter;
    return {
      agent_principal_id: agent.agent_principal_id,
      agent_id: agent.agent_id,
      owner_type: agent.owner_type,
      owner_id: agent.owner_id,
      status: agent.status,
      attributes: agent.attributes,
      created_at: agent.created_at,
      webhook_url: agent.webhook_url,
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
      owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
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

    store.approvalRequests.write(req);

    // Update state
    store.state.updateState(s => {
      if (!s.approval_requests) s.approval_requests = [];
      s.approval_requests.push({
        approval_request_id: approvalRequestId,
        owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
        agent_principal_id: agentEntry.agent_principal_id,
        status: 'PENDING',
        path: `./approval-requests/${approvalRequestId}.md`,
      });
    });

    store.audit.append('APPROVAL_REQUEST_CREATED', {
      approval_request_id: approvalRequestId,
      agent_id: agent.agent_id,
      agent_principal_id: agentEntry.agent_principal_id,
      owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
      action_type: action.action_type,
      decision_id: body.decision_id,
      action_hash: actionHash,
      justification: body.justification ?? null,
      action_payload: action.payload ?? null,
      subject_principal_id: action.subject?.principal_id ?? null,
      expires_at: expiresAt.toISOString(),
    });

    events.emit('approval_request.created', {
      approval_request_id: approvalRequestId,
      decision_id: body.decision_id,
      agent_id: agent.agent_id,
      agent_principal_id: agentEntry.agent_principal_id,
      owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
      action_type: action.action_type,
      justification: body.justification ?? null,
      expires_at: expiresAt.toISOString(),
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

    const state = store.state.getState();
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
      const req = store.approvalRequests.read(id);
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

  // ─── Policy drafts (agent-facing) ──────────────────────────────────

  // POST /v1/agent/policy-drafts
  app.post('/v1/agent/policy-drafts', { preHandler: agentAuth }, async (request, reply) => {
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;
    const agent = (request as unknown as Record<string, unknown>).agentPrincipal as AgentFrontmatter;

    const body = request.body as {
      policy_yaml: string;
      applies_to_agent_principal_id?: string | null;
      name?: string;
      description?: string;
      justification?: string;
    };

    if (!body.policy_yaml) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'policy_yaml is required' },
      });
      return;
    }

    // Validate the YAML is a valid policy
    try {
      parsePolicyYaml(body.policy_yaml);
    } catch (e: unknown) {
      reply.code(400).send({
        error: { code: 'INVALID_POLICY', message: (e as Error).message },
      });
      return;
    }

    // Validate target agent belongs to the same owner
    const appliesToAgent = body.applies_to_agent_principal_id !== undefined
      ? body.applies_to_agent_principal_id
      : agentEntry.agent_principal_id;

    if (appliesToAgent) {
      const state = store.state.getState();
      const targetAgent = state.agents.find((a: { agent_principal_id: string }) => a.agent_principal_id === appliesToAgent);
      if (!targetAgent || targetAgent.owner_type !== agentEntry.owner_type || targetAgent.owner_id !== agentEntry.owner_id) {
        reply.code(400).send({
          error: { code: 'INVALID_AGENT', message: 'Target agent does not belong to your owner' },
        });
        return;
      }
    }

    const policyDraftId = crypto.randomUUID();
    const now = new Date();

    const draft: PolicyDraftFrontmatter = {
      policy_draft_id: policyDraftId,
      agent_principal_id: agentEntry.agent_principal_id,
      agent_id: agent.agent_id,
      owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
      applies_to_agent_principal_id: appliesToAgent,
      name: body.name?.trim() || null,
      description: body.description?.trim() || null,
      policy_yaml: body.policy_yaml,
      justification: body.justification ?? null,
      status: 'PENDING',
      resulting_policy_id: null,
      resolved_at: null,
      resolved_by: null,
      denial_reason: null,
      created_at: now.toISOString(),
    };

    store.policyDrafts.write(draft);

    // Update state
    store.state.updateState(s => {
      if (!s.policy_drafts) s.policy_drafts = [];
      s.policy_drafts.push({
        policy_draft_id: policyDraftId,
        owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
        agent_principal_id: agentEntry.agent_principal_id,
        status: 'PENDING',
        path: `./policy-drafts/${policyDraftId}.md`,
      });
    });

    store.audit.append('POLICY_DRAFT_CREATED', {
      policy_draft_id: policyDraftId,
      agent_id: agent.agent_id,
      agent_principal_id: agentEntry.agent_principal_id,
      owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
      justification: body.justification ?? null,
      applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
    });

    events.emit('policy_draft.created', {
      policy_draft_id: policyDraftId,
      agent_id: agent.agent_id,
      agent_principal_id: agentEntry.agent_principal_id,
      owner_type: agentEntry.owner_type,
      owner_id: agentEntry.owner_id,
      name: draft.name,
      justification: body.justification ?? null,
    });

    return {
      policy_draft_id: policyDraftId,
      status: 'PENDING',
      created_at: now.toISOString(),
    };
  });

  // GET /v1/agent/policy-drafts
  app.get('/v1/agent/policy-drafts', { preHandler: agentAuth }, async (request) => {
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;
    const query = request.query as { status?: string };

    const state = store.state.getState();
    let drafts = (state.policy_drafts ?? [])
      .filter((d) => d.agent_principal_id === agentEntry.agent_principal_id);

    if (query.status) {
      drafts = drafts.filter((d) => d.status === query.status);
    }

    const details = drafts.map((entry) => {
      try {
        const draft = store.policyDrafts.read(entry.policy_draft_id);
        return {
          policy_draft_id: draft.policy_draft_id,
          status: draft.status,
          name: draft.name ?? null,
          description: draft.description ?? null,
          justification: draft.justification,
          created_at: draft.created_at,
          resolved_at: draft.resolved_at,
          denial_reason: draft.denial_reason,
          resulting_policy_id: draft.resulting_policy_id,
        };
      } catch {
        return { policy_draft_id: entry.policy_draft_id, error: 'file_not_found' };
      }
    });

    return { policy_drafts: details };
  });

  // GET /v1/agent/policy-drafts/:id
  app.get('/v1/agent/policy-drafts/:id', { preHandler: agentAuth }, async (request, reply) => {
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;
    const { id } = request.params as { id: string };

    const state = store.state.getState();
    const entry = (state.policy_drafts ?? []).find(
      (d) => d.policy_draft_id === id && d.agent_principal_id === agentEntry.agent_principal_id
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy draft not found' },
      });
      return;
    }

    try {
      const draft = store.policyDrafts.read(id);
      return {
        policy_draft_id: draft.policy_draft_id,
        status: draft.status,
        name: draft.name ?? null,
        description: draft.description ?? null,
        policy_yaml: draft.policy_yaml,
        applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
        justification: draft.justification,
        created_at: draft.created_at,
        resolved_at: draft.resolved_at,
        denial_reason: draft.denial_reason,
        resulting_policy_id: draft.resulting_policy_id,
      };
    } catch {
      reply.code(404).send({
        error: { code: 'FILE_NOT_FOUND', message: 'Policy draft file not found' },
      });
    }
  });
}
