import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  ActionRequestSchema,
  readState,
  readKeyFile,
  readPolicyFile,
  parsePolicyYaml,
  evaluate,
  issueProofToken,
  appendAuditEvent,
  verifyApprovalToken,
  readApprovalRequestFile,
  writeApprovalRequestFile,
  computeActionHash,
} from '@openleash/core';
import type { OpenleashConfig, StateAgentEntry } from '@openleash/core';
import { NonceCache } from '@openleash/core';
import { createAgentAuth } from '../middleware/agent-auth.js';

export function registerAuthorizeRoutes(
  app: FastifyInstance,
  dataDir: string,
  config: OpenleashConfig,
  nonceCache: NonceCache
) {
  const agentAuth = createAgentAuth(config, dataDir, nonceCache);

  app.post('/v1/authorize', { preHandler: agentAuth }, async (request, reply) => {
    // Extract approval_token before Zod validation (it's not part of ActionRequestSchema)
    const rawBody = request.body as Record<string, unknown>;
    const approvalTokenStr = rawBody.approval_token as string | undefined;

    // Remove approval_token from body before validating
    const { approval_token: _approvalToken, ...actionBody } = rawBody;

    const parseResult = ActionRequestSchema.safeParse(actionBody);
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
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;

    appendAuditEvent(dataDir, 'AUTHORIZE_CALLED', {
      agent_id: action.principal.agent_id,
      action_type: action.action_type,
    }, { action_id: action.action_id, principal_id: agentEntry.agent_principal_id });

    // ─── Approval token path ──────────────────────────────────────────
    if (approvalTokenStr) {
      const state = readState(dataDir);
      const keys = state.server_keys.keys.map((k) => readKeyFile(dataDir, k.kid));
      const tokenResult = await verifyApprovalToken(approvalTokenStr, keys);

      if (!tokenResult.valid || !tokenResult.claims) {
        reply.code(401).send({
          error: { code: 'INVALID_APPROVAL_TOKEN', message: tokenResult.reason ?? 'Invalid approval token' },
        });
        return;
      }

      const claims = tokenResult.claims;

      // Load approval request
      let approvalReq;
      try {
        approvalReq = readApprovalRequestFile(dataDir, claims.approval_request_id);
      } catch {
        reply.code(400).send({
          error: { code: 'APPROVAL_REQUEST_NOT_FOUND', message: 'Approval request not found' },
        });
        return;
      }

      // Check status and not consumed
      if (approvalReq.status !== 'APPROVED') {
        reply.code(400).send({
          error: { code: 'INVALID_APPROVAL_STATUS', message: `Approval request status is ${approvalReq.status}` },
        });
        return;
      }

      if (approvalReq.consumed_at) {
        reply.code(400).send({
          error: { code: 'APPROVAL_TOKEN_CONSUMED', message: 'Approval token has already been used' },
        });
        return;
      }

      // Verify action_hash matches
      const currentActionHash = computeActionHash(action);
      if (claims.action_hash !== currentActionHash) {
        reply.code(400).send({
          error: { code: 'ACTION_HASH_MISMATCH', message: 'Action does not match the approved request' },
        });
        return;
      }

      // Verify agent matches
      if (claims.agent_id !== action.principal.agent_id) {
        reply.code(400).send({
          error: { code: 'AGENT_MISMATCH', message: 'Agent does not match the approved request' },
        });
        return;
      }

      // Mark as consumed
      approvalReq.consumed_at = new Date().toISOString();
      writeApprovalRequestFile(dataDir, approvalReq);

      // Issue proof token directly
      const activeKey = readKeyFile(dataDir, state.server_keys.active_kid);
      let ttl = config.tokens.default_ttl_seconds;
      if (ttl > config.tokens.max_ttl_seconds) ttl = config.tokens.max_ttl_seconds;

      const decisionId = crypto.randomUUID();
      const proof = await issueProofToken({
        key: activeKey,
        decisionId,
        ownerPrincipalId: agentEntry.owner_principal_id,
        agentId: action.principal.agent_id,
        actionType: action.action_type,
        actionHash: currentActionHash,
        matchedRuleId: null,
        ttlSeconds: ttl,
      });

      appendAuditEvent(dataDir, 'APPROVAL_TOKEN_USED', {
        approval_request_id: claims.approval_request_id,
        decision_id: decisionId,
        agent_id: action.principal.agent_id,
        action_hash: currentActionHash,
      }, { decision_id: decisionId, action_id: action.action_id, principal_id: agentEntry.agent_principal_id });

      appendAuditEvent(dataDir, 'DECISION_CREATED', {
        decision_id: decisionId,
        result: 'ALLOW',
        matched_rule_id: null,
        action_hash: currentActionHash,
        via_approval: true,
      }, { decision_id: decisionId, action_id: action.action_id, principal_id: agentEntry.agent_principal_id });

      return {
        decision_id: decisionId,
        action_id: action.action_id,
        action_hash: currentActionHash,
        result: 'ALLOW',
        matched_rule_id: null,
        reason: 'Approved by owner',
        proof_token: proof.token,
        proof_expires_at: proof.expiresAt,
        obligations: [],
      };
    }

    // ─── Standard policy evaluation path ──────────────────────────────
    // Find applicable policy
    const state = readState(dataDir);
    const binding = state.bindings.find((b) => {
      // Match by agent or owner
      if (b.applies_to_agent_principal_id === agentEntry.agent_principal_id) return true;
      if (b.applies_to_agent_principal_id === null && b.owner_principal_id === agentEntry.owner_principal_id) return true;
      return false;
    });

    if (!binding) {
      reply.code(403).send({
        error: { code: 'NO_POLICY', message: 'No policy bound to this agent or owner' },
      });
      return;
    }

    const policyEntry = state.policies.find((p) => p.policy_id === binding.policy_id);
    if (!policyEntry) {
      reply.code(500).send({
        error: { code: 'POLICY_NOT_FOUND', message: 'Bound policy file not found' },
      });
      return;
    }

    const policyYaml = readPolicyFile(dataDir, policyEntry.policy_id);
    const policy = parsePolicyYaml(policyYaml);

    // Evaluate
    const engineResult = evaluate(action, policy, {
      defaultProofTtl: config.tokens.default_ttl_seconds,
    });

    const response = engineResult.response;

    // Issue proof if needed
    if (engineResult.proofRequired && response.result === 'ALLOW') {
      let ttl = engineResult.proofTtlSeconds ?? config.tokens.default_ttl_seconds;
      if (ttl > config.tokens.max_ttl_seconds) {
        ttl = config.tokens.max_ttl_seconds;
      }

      const activeKey = readKeyFile(dataDir, state.server_keys.active_kid);
      const proof = await issueProofToken({
        key: activeKey,
        decisionId: response.decision_id,
        ownerPrincipalId: agentEntry.owner_principal_id,
        agentId: action.principal.agent_id,
        actionType: action.action_type,
        actionHash: response.action_hash,
        matchedRuleId: response.matched_rule_id,
        ttlSeconds: ttl,
        trustProfile: action.relying_party?.trust_profile,
      });

      response.proof_token = proof.token;
      response.proof_expires_at = proof.expiresAt;

      appendAuditEvent(dataDir, 'PROOF_ISSUED', {
        decision_id: response.decision_id,
        action_hash: response.action_hash,
      }, { decision_id: response.decision_id, action_id: action.action_id });
    }

    appendAuditEvent(dataDir, 'DECISION_CREATED', {
      decision_id: response.decision_id,
      result: response.result,
      matched_rule_id: response.matched_rule_id,
      action_hash: response.action_hash,
    }, { decision_id: response.decision_id, action_id: action.action_id, principal_id: agentEntry.agent_principal_id });

    return response;
  });
}
