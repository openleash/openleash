import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifySessionToken,
  resolveSystemRoles,
} from '@openleash/core';
import type { OpenleashConfig, DataStore, ServerPluginManifest, SessionClaims } from '@openleash/core';

export function createOwnerAuth(config: OpenleashConfig, store: DataStore, pluginManifest?: ServerPluginManifest) {
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

    // ── Plugin token verification (hosted mode) ──────────────────────
    // When the plugin provides verifyToken, use it exclusively —
    // no PASETO fallback for user sessions.
    if (pluginManifest?.verifyToken) {
      const result = await pluginManifest.verifyToken(token);
      if (!result) {
        deny('INVALID_SESSION', 'Invalid session token');
        return;
      }

      const state = store.state.getState();
      const userEntry = state.users.find((u) => u.user_principal_id === result.user_principal_id);
      if (!userEntry) {
        deny('USER_NOT_FOUND', 'User not found');
        return;
      }

      const user = store.users.read(result.user_principal_id);
      if (user.status !== 'ACTIVE') {
        deny('USER_INACTIVE', 'User account is not active');
        return;
      }

      const claims: SessionClaims = {
        iss: 'openleash:plugin',
        kid: '',
        sub: result.user_principal_id,
        iat: new Date().toISOString(),
        exp: '',
        purpose: 'user_session',
        system_roles: resolveSystemRoles(user),
      };

      (request as unknown as Record<string, unknown>).ownerSession = claims;
      return;
    }

    // ── PASETO session token verification (self-hosted) ──────────────
    const state = store.state.getState();
    const keys = state.server_keys.keys.map((k) => store.keys.read(k.kid));

    const result = await verifySessionToken(token, keys);
    if (!result.valid || !result.claims) {
      deny('INVALID_SESSION', result.reason ?? 'Invalid session token');
      return;
    }

    // Verify user exists and is active
    const userEntry = state.users.find((u) => u.user_principal_id === result.claims!.sub);
    if (!userEntry) {
      deny('USER_NOT_FOUND', 'User not found');
      return;
    }

    const user = store.users.read(result.claims.sub);
    if (user.status !== 'ACTIVE') {
      deny('USER_INACTIVE', 'User account is not active');
      return;
    }

    // Always resolve system_roles from store (authoritative source)
    // The token may contain stale roles if they were changed after login
    result.claims.system_roles = resolveSystemRoles(user);

    // Attach session info to request
    (request as unknown as Record<string, unknown>).ownerSession = result.claims;
  };
}
