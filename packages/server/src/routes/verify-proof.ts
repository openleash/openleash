import type { FastifyInstance } from 'fastify';
import { verifyProofToken } from '@openleash/core';
import type { DataStore } from '@openleash/core';

export function registerVerifyProofRoutes(app: FastifyInstance, store: DataStore) {
  app.post('/v1/verify-proof', async (request) => {
    const body = request.body as {
      token: string;
      expected_action_hash?: string;
      expected_agent_id?: string;
    };

    if (!body.token) {
      return { valid: false, reason: 'Missing token' };
    }

    const state = store.state.getState();
    const keys = state.server_keys.keys.map((entry) => store.keys.read(entry.kid));

    const result = await verifyProofToken(body.token, keys);

    // Check expected values
    if (result.valid && result.claims) {
      if (body.expected_action_hash && result.claims.action_hash !== body.expected_action_hash) {
        result.valid = false;
        result.reason = 'action_hash mismatch';
      }
      if (body.expected_agent_id && result.claims.agent_id !== body.expected_agent_id) {
        result.valid = false;
        result.reason = 'agent_id mismatch';
      }
    }

    store.audit.append('PROOF_VERIFIED', {
      valid: result.valid,
      reason: result.reason,
      decision_id: result.claims?.decision_id ?? null,
      agent_id: result.claims?.agent_id ?? null,
      action_type: result.claims?.action_type ?? null,
      action_hash: result.claims?.action_hash ?? null,
      expected_action_hash: body.expected_action_hash ?? null,
      expected_agent_id: body.expected_agent_id ?? null,
    });

    return {
      valid: result.valid,
      reason: result.reason,
      claims: result.claims,
    };
  });
}
