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
} from '@openleash/core';
import type { OpenleashConfig, AgentFrontmatter, StateAgentEntry } from '@openleash/core';
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
    const parseResult = ActionRequestSchema.safeParse(request.body);
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
    const agentPrincipal = (request as unknown as Record<string, unknown>).agentPrincipal as AgentFrontmatter;

    appendAuditEvent(dataDir, 'AUTHORIZE_CALLED', {
      agent_id: action.principal.agent_id,
      action_type: action.action_type,
    }, { action_id: action.action_id, principal_id: agentEntry.agent_principal_id });

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
