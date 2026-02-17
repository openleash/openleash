import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  writeState,
  writeAgentFile,
  appendAuditEvent,
} from '@openleash/core';
import type { RegistrationChallenge } from '@openleash/core';

// In-memory challenge store
const challenges = new Map<string, RegistrationChallenge>();

// Cleanup expired challenges every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of challenges) {
    if (new Date(ch.expires_at).getTime() < now) {
      challenges.delete(id);
    }
  }
}, 60_000).unref();

export function registerAgentRoutes(app: FastifyInstance, dataDir: string) {
  // POST /v1/agents/registration-challenge
  app.post('/v1/agents/registration-challenge', async (request, reply) => {
    const body = request.body as {
      agent_id: string;
      agent_pubkey_b64: string;
      owner_principal_id?: string;
      agent_attributes_json?: Record<string, unknown>;
    };

    if (!body.agent_id || !body.agent_pubkey_b64) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'agent_id and agent_pubkey_b64 are required' },
      });
      return;
    }

    const challengeBytes = crypto.randomBytes(32);
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const challenge: RegistrationChallenge = {
      challenge_id: challengeId,
      challenge_b64: challengeBytes.toString('base64'),
      agent_id: body.agent_id,
      agent_pubkey_b64: body.agent_pubkey_b64,
      owner_principal_id: body.owner_principal_id,
      agent_attributes_json: body.agent_attributes_json,
      expires_at: expiresAt,
    };

    challenges.set(challengeId, challenge);

    appendAuditEvent(dataDir, 'AGENT_CHALLENGE_ISSUED', {
      challenge_id: challengeId,
      agent_id: body.agent_id,
    });

    return {
      challenge_id: challengeId,
      challenge_b64: challengeBytes.toString('base64'),
      expires_at: expiresAt,
    };
  });

  // POST /v1/agents/register
  app.post('/v1/agents/register', async (request, reply) => {
    const body = request.body as {
      challenge_id: string;
      agent_id: string;
      agent_pubkey_b64: string;
      signature_b64: string;
      owner_principal_id: string;
      agent_attributes_json?: Record<string, unknown>;
    };

    if (!body.challenge_id || !body.agent_id || !body.agent_pubkey_b64 || !body.signature_b64 || !body.owner_principal_id) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
      });
      return;
    }

    // Look up challenge
    const challenge = challenges.get(body.challenge_id);
    if (!challenge) {
      reply.code(400).send({
        error: { code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found or expired' },
      });
      return;
    }

    // Check expiry
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      challenges.delete(body.challenge_id);
      reply.code(400).send({
        error: { code: 'CHALLENGE_EXPIRED', message: 'Challenge has expired' },
      });
      return;
    }

    // Verify signature over challenge bytes
    const challengeBytes = Buffer.from(challenge.challenge_b64, 'base64');
    const signature = Buffer.from(body.signature_b64, 'base64');
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(body.agent_pubkey_b64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const valid = crypto.verify(null, challengeBytes, publicKey, signature);
    if (!valid) {
      reply.code(401).send({
        error: { code: 'INVALID_SIGNATURE', message: 'Challenge signature verification failed' },
      });
      return;
    }

    // Clean up challenge
    challenges.delete(body.challenge_id);

    // Create agent
    const agentPrincipalId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    writeAgentFile(dataDir, {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      public_key_b64: body.agent_pubkey_b64,
      status: 'ACTIVE',
      attributes: body.agent_attributes_json ?? {},
      created_at: createdAt,
      revoked_at: null,
    });

    // Update state.md
    const state = readState(dataDir);
    state.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      path: `./agents/${agentPrincipalId}.md`,
    });
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'AGENT_REGISTERED', {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
    });

    return {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      status: 'ACTIVE',
      created_at: createdAt,
    };
  });
}
