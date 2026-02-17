import type { FastifyInstance } from 'fastify';
import { readState, readKeyFile, verifyProofToken, appendAuditEvent } from '@openleash/core';

export function registerVerifyProofRoutes(app: FastifyInstance, dataDir: string) {
  app.post('/v1/verify-proof', async (request) => {
    const body = request.body as {
      token: string;
      expected_action_hash?: string;
      expected_agent_id?: string;
    };

    if (!body.token) {
      return { valid: false, reason: 'Missing token' };
    }

    const state = readState(dataDir);
    const keys = state.server_keys.keys.map((entry) => readKeyFile(dataDir, entry.kid));

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

    appendAuditEvent(dataDir, 'PROOF_VERIFIED', {
      valid: result.valid,
      reason: result.reason,
    });

    return {
      valid: result.valid,
      reason: result.reason,
      claims: result.claims,
    };
  });
}
