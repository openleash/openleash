import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifySessionToken,
} from '@openleash/core';
import type { OpenleashConfig, DataStore } from '@openleash/core';

export function createOwnerAuth(config: OpenleashConfig, store: DataStore) {
  return async function ownerAuth(request: FastifyRequest, reply: FastifyReply) {
    const isGuiRequest = request.url.startsWith('/gui/');

    function deny(code: string, message: string) {
      if (isGuiRequest) {
        reply.redirect('/gui/login');
      } else {
        reply.code(401).send({ error: { code, message } });
      }
    }

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
      deny('MISSING_TOKEN', 'Missing session token');
      return;
    }

    // Load server keys
    const state = store.state.getState();
    const keys = state.server_keys.keys.map((k) => store.keys.read(k.kid));

    // Verify session token
    const result = await verifySessionToken(token, keys);
    if (!result.valid || !result.claims) {
      deny('INVALID_SESSION', result.reason ?? 'Invalid session token');
      return;
    }

    // Verify owner exists and is active
    const ownerEntry = state.owners.find((o) => o.owner_principal_id === result.claims!.sub);
    if (!ownerEntry) {
      deny('OWNER_NOT_FOUND', 'Owner not found');
      return;
    }

    const owner = store.owners.read(result.claims.sub);
    if (owner.status !== 'ACTIVE') {
      deny('OWNER_INACTIVE', 'Owner account is not active');
      return;
    }

    // Attach session info to request
    (request as unknown as Record<string, unknown>).ownerSession = result.claims;
  };
}
