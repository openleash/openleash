import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  readState,
  readAgentFile,
  verifyRequestSignature,
  sha256Hex,
  NonceCache,
} from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';

export function createAgentAuth(config: OpenleashConfig, dataDir: string, nonceCache: NonceCache) {
  return async function agentAuth(request: FastifyRequest, reply: FastifyReply) {
    const agentId = request.headers['x-agent-id'] as string;
    const timestamp = request.headers['x-timestamp'] as string;
    const nonce = request.headers['x-nonce'] as string;
    const bodySha256 = request.headers['x-body-sha256'] as string;
    const signatureB64 = request.headers['x-signature'] as string;

    if (!agentId || !timestamp || !nonce || !bodySha256 || !signatureB64) {
      reply.code(401).send({
        error: { code: 'MISSING_HEADERS', message: 'Missing required signing headers' },
      });
      return;
    }

    // Verify timestamp within clock skew
    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    const skewMs = config.security.clock_skew_seconds * 1000;
    if (Math.abs(now - requestTime) > skewMs) {
      reply.code(401).send({
        error: { code: 'TIMESTAMP_SKEW', message: 'Request timestamp outside allowed clock skew window' },
      });
      return;
    }

    // Verify nonce uniqueness
    if (!nonceCache.check(agentId, nonce)) {
      reply.code(401).send({
        error: { code: 'NONCE_REPLAY', message: 'Nonce has already been used' },
      });
      return;
    }

    // Verify body hash
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      reply.code(400).send({
        error: { code: 'MISSING_BODY', message: 'Request body is required' },
      });
      return;
    }
    const computedHash = sha256Hex(rawBody);
    if (computedHash !== bodySha256) {
      reply.code(401).send({
        error: { code: 'BODY_HASH_MISMATCH', message: 'Body hash does not match' },
      });
      return;
    }

    // Look up agent
    const state = readState(dataDir);
    const agentEntry = state.agents.find((a) => a.agent_id === agentId);
    if (!agentEntry) {
      reply.code(401).send({
        error: { code: 'AGENT_NOT_FOUND', message: `Agent "${agentId}" not found` },
      });
      return;
    }

    const agent = readAgentFile(dataDir, agentEntry.agent_principal_id);
    if (agent.status !== 'ACTIVE') {
      reply.code(401).send({
        error: { code: 'AGENT_INACTIVE', message: `Agent "${agentId}" is not active` },
      });
      return;
    }

    // Verify signature
    const urlPath = request.url.split('?')[0];
    const valid = verifyRequestSignature({
      method: request.method,
      path: urlPath,
      timestamp,
      nonce,
      bodySha256,
      signatureB64,
      publicKeyB64: agent.public_key_b64,
    });

    if (!valid) {
      reply.code(401).send({
        error: { code: 'INVALID_SIGNATURE', message: 'Request signature verification failed' },
      });
      return;
    }

    // Attach agent info to request
    (request as unknown as Record<string, unknown>).agentPrincipal = agent;
    (request as unknown as Record<string, unknown>).agentEntry = agentEntry;
  };
}
