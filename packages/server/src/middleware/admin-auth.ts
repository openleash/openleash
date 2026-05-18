import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifySessionToken, resolveSystemRoles } from '@openleash/core';
import type { OpenleashConfig, DataStore, ServerPluginManifest } from '@openleash/core';

export interface AdminSession {
  principal_id: string | null;
  auth_method: 'session' | 'token' | 'localhost';
}

export function createAdminAuth(config: OpenleashConfig, store: DataStore, pluginManifest?: ServerPluginManifest) {
  return async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
    const isHosted = config.instance?.mode === 'hosted';

    // Match owner-auth: API clients send a Bearer token or don't advertise
    // `text/html`. Only a plain browser navigation to /gui/* gets the redirect
    // — otherwise a fetch that auto-follows redirects ends up parsing the
    // landing HTML as the requested resource.
    const hasBearer = (request.headers.authorization ?? '').startsWith('Bearer ');
    const acceptsHtml = (request.headers.accept ?? '').includes('text/html');
    const isBrowserNavigation = request.url.startsWith('/gui/') && acceptsHtml && !hasBearer;

    function denyUnauthenticated(code: string, message: string) {
      if (isBrowserNavigation) {
        reply.redirect('/gui/login?returnTo=' + encodeURIComponent(request.url));
      } else {
        reply.code(401).send({ error: { code, message } });
      }
    }

    // Authenticated as a valid owner, but lacks the admin role. Must NOT
    // redirect to login — the landing page auto-renews the session and bounces
    // straight back here, producing an infinite loop. Render a 403 instead.
    function denyForbidden(code: string, message: string) {
      if (isBrowserNavigation) {
        reply.code(403).type('text/html').send(renderAdminForbiddenHtml());
      } else {
        reply.code(403).send({ error: { code, message } });
      }
    }

    function attachSession(session: AdminSession) {
      (request as unknown as Record<string, unknown>).adminSession = session;
    }

    // Tracks whether any auth path validated the caller as a real user who
    // just happens to lack the admin role. If true and no later path grants
    // admin access (e.g. localhost bypass), we return 403 instead of redirect.
    let authenticatedNonAdmin = false;

    // ── Path 0: Plugin token verification (hosted mode) ───────────────
    if (pluginManifest?.verifyToken) {
      const bearerToken = extractBearerToken(request);
      if (bearerToken) {
        const result = await pluginManifest.verifyToken(bearerToken);
        if (result) {
          const state = store.state.getState();
          const userEntry = state.users.find((u) => u.user_principal_id === result.user_principal_id);
          if (userEntry) {
            const user = store.users.read(result.user_principal_id);
            if (user.status === 'ACTIVE') {
              const systemRoles = resolveSystemRoles(user);
              if (systemRoles.includes('admin')) {
                attachSession({ principal_id: result.user_principal_id, auth_method: 'session' });
                return;
              }
              authenticatedNonAdmin = true;
            }
          }
        }
      }
    }

    // ── Path 1: PASETO session token with admin role ──────────────────
    const sessionToken = extractSessionToken(request);
    if (sessionToken) {
      const state = store.state.getState();
      const keys = state.server_keys.keys.map((k) => store.keys.read(k.kid));
      const result = await verifySessionToken(sessionToken, keys);

      if (result.valid && result.claims) {
        // Verify user still exists and is active
        const userEntry = state.users.find((u) => u.user_principal_id === result.claims!.sub);
        if (userEntry) {
          const user = store.users.read(result.claims.sub);
          if (user.status === 'ACTIVE') {
            const systemRoles = result.claims.system_roles ?? resolveSystemRoles(user);
            if (systemRoles.includes('admin')) {
              attachSession({ principal_id: result.claims.sub, auth_method: 'session' });
              return;
            }
            authenticatedNonAdmin = true;
          }
        }
      }
    }

    // ── Path 2: Legacy admin token (API-only) ─────────────────────────
    if (config.admin.token && validateAdminToken(request, config.admin.token)) {
      if (isBrowserNavigation) {
        denyUnauthenticated('ADMIN_UNAUTHORIZED', 'Please log in with your account');
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

    if (authenticatedNonAdmin) {
      denyForbidden('ADMIN_REQUIRED', 'Your account does not have the admin role');
      return;
    }

    denyUnauthenticated('ADMIN_UNAUTHORIZED', 'Admin access requires an account with admin role');
  };
}

function renderAdminForbiddenHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin access required - OpenLeash</title>
  <style>
    :root { color-scheme: dark light; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b1015; color: #e7eef5; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .card { max-width: 28rem; padding: 2rem; border: 1px solid #1f2933; border-radius: 12px; background: #11171f; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { line-height: 1.5; color: #b9c2cc; margin: 0 0 1rem; }
    a { color: #34d399; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Admin access required</h1>
    <p>You're signed in, but your account does not have the admin role. Ask an existing admin to grant you the role.</p>
    <div class="actions">
      <a href="/gui/dashboard">Back to your dashboard</a>
    </div>
  </main>
</body>
</html>`;
}

function extractBearerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)openleash_session=([^\s;]+)/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function extractSessionToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer v4.public.')) {
    return authHeader.slice(7);
  }

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

  const authHeader = request.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      if (parts[1].startsWith('v4.public.')) return false;
      try {
        if (crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedToken))) {
          return true;
        }
      } catch {
        // length mismatch
      }
    }
  }

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
