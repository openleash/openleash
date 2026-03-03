import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  readState,
  readOwnerFile,
  verifySessionToken,
  readKeyFile,
} from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';

export function createOwnerAuth(config: OpenleashConfig, dataDir: string) {
  return async function ownerAuth(request: FastifyRequest, reply: FastifyReply) {
    // Extract Bearer token from Authorization header or cookie
    let token: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Fallback to cookie for GUI page navigation
    if (!token) {
      const cookieHeader = request.headers.cookie;
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)openleash_session=([^\s;]+)/);
        if (match) {
          token = match[1];
        }
      }
    }

    if (!token) {
      reply.code(401).send({
        error: { code: 'MISSING_TOKEN', message: 'Missing session token' },
      });
      return;
    }

    // Load server keys
    const state = readState(dataDir);
    const keys = state.server_keys.keys.map((k) => readKeyFile(dataDir, k.kid));

    // Verify session token
    const result = await verifySessionToken(token, keys);
    if (!result.valid || !result.claims) {
      reply.code(401).send({
        error: { code: 'INVALID_SESSION', message: result.reason ?? 'Invalid session token' },
      });
      return;
    }

    // Verify owner exists and is active
    const ownerEntry = state.owners.find((o) => o.owner_principal_id === result.claims!.sub);
    if (!ownerEntry) {
      reply.code(401).send({
        error: { code: 'OWNER_NOT_FOUND', message: 'Owner not found' },
      });
      return;
    }

    const owner = readOwnerFile(dataDir, result.claims.sub);
    if (owner.status !== 'ACTIVE') {
      reply.code(401).send({
        error: { code: 'OWNER_INACTIVE', message: 'Owner account is not active' },
      });
      return;
    }

    // Attach session info to request
    (request as unknown as Record<string, unknown>).ownerSession = result.claims;
  };
}
