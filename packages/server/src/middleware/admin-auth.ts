import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifySessionToken } from '@openleash/core';
import type { OpenleashConfig, DataStore } from '@openleash/core';

export interface AdminSession {
  principal_id: string | null;
  auth_method: 'session' | 'token' | 'localhost';
}

export function createAdminAuth(config: OpenleashConfig, store: DataStore) {
  return async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
    const isHosted = config.instance?.mode === 'hosted';
    const isGuiRequest = request.url.startsWith('/gui/');

    function deny(code: string, message: string, statusCode = 401) {
      if (isGuiRequest) {
        reply.redirect('/gui/login?redirect=' + encodeURIComponent(request.url));
      } else {
        reply.code(statusCode).send({ error: { code, message } });
      }
    }

    function attachSession(session: AdminSession) {
      (request as unknown as Record<string, unknown>).adminSession = session;
    }

    // ── Path 1: PASETO session token with admin role ──────────────────
    const sessionToken = extractSessionToken(request);
    if (sessionToken) {
      const state = store.state.getState();
      const keys = state.server_keys.keys.map((k) => store.keys.read(k.kid));
      const result = await verifySessionToken(sessionToken, keys);

      if (result.valid && result.claims) {
        const roles = result.claims.roles ?? [];
        if (roles.includes('admin')) {
          // Verify owner still exists and is active
          const ownerEntry = state.owners.find((o) => o.owner_principal_id === result.claims!.sub);
          if (ownerEntry) {
            const owner = store.owners.read(result.claims.sub);
            if (owner.status === 'ACTIVE') {
              attachSession({ principal_id: result.claims.sub, auth_method: 'session' });
              return;
            }
          }
        }
      }
    }

    // ── Path 2: Legacy admin token (API-only) ─────────────────────────
    if (config.admin.token && validateAdminToken(request, config.admin.token)) {
      if (isGuiRequest) {
        // For GUI, token auth is not allowed — redirect to login
        deny('ADMIN_UNAUTHORIZED', 'Please log in with your account');
        return;
      }
      attachSession({ principal_id: null, auth_method: 'token' });
      return;
    }

    // ── Path 3: Localhost bypass (self-hosted only) ─────────────────────
    if (!isHosted) {
      const mode = config.admin.mode;
      const isLocalhost = isLocalhostRequest(request);

      if ((mode === 'localhost' || mode === 'localhost_or_token') && isLocalhost) {
        attachSession({ principal_id: null, auth_method: 'localhost' });
        return;
      }
    }

    deny('ADMIN_UNAUTHORIZED', 'Admin access requires an account with admin role');
  };
}

function extractSessionToken(request: FastifyRequest): string | undefined {
  // Check Authorization header (could be a PASETO session token)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer v4.public.')) {
    return authHeader.slice(7);
  }

  // Fallback to session cookie
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)openleash_session=([^\s;]+)/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function isLocalhostRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function validateAdminToken(request: FastifyRequest, expectedToken: string): boolean {
  if (!expectedToken) return false;

  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      // Skip PASETO tokens — those are handled by session auth
      if (parts[1].startsWith('v4.public.')) return false;
      try {
        if (crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedToken))) {
          return true;
        }
      } catch {
        // length mismatch — fall through
      }
    }
  }

  // Fallback to admin cookie
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)openleash_admin=([^\s;]+)/);
    if (match) {
      try {
        return crypto.timingSafeEqual(Buffer.from(match[1]), Buffer.from(expectedToken));
      } catch {
        return false;
      }
    }
  }

  return false;
}
