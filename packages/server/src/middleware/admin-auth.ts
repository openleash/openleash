import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { OpenleashConfig } from '@openleash/core';

export function createAdminAuth(config: OpenleashConfig) {
  return async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
    const isHosted = config.instance?.mode === 'hosted';
    const isGuiRequest = request.url.startsWith('/gui/');

    function deny(code: string, message: string, statusCode = 401) {
      if (isGuiRequest) {
        reply.redirect('/gui/admin/login');
      } else {
        reply.code(statusCode).send({ error: { code, message } });
      }
    }

    // In hosted mode, always require token — no localhost bypass
    if (isHosted) {
      if (!validateAdminToken(request, config.admin.token)) {
        deny('ADMIN_UNAUTHORIZED', 'Invalid or missing admin token');
        return;
      }
      return;
    }

    const mode = config.admin.mode;
    const isLocalhost = isLocalhostRequest(request);

    if (mode === 'localhost') {
      if (!isLocalhost && !config.admin.allow_remote_admin) {
        deny('ADMIN_FORBIDDEN', 'Admin access requires localhost connection', 403);
        return;
      }
      return; // localhost access allowed
    }

    if (mode === 'token') {
      if (!validateAdminToken(request, config.admin.token)) {
        deny('ADMIN_UNAUTHORIZED', 'Invalid or missing admin token');
        return;
      }
      return;
    }

    // localhost_or_token
    if (isLocalhost) {
      return; // localhost bypass
    }
    if (config.admin.allow_remote_admin && validateAdminToken(request, config.admin.token)) {
      return;
    }
    if (!config.admin.allow_remote_admin) {
      // For local requests, token also works
      if (validateAdminToken(request, config.admin.token)) {
        return;
      }
    }

    deny('ADMIN_UNAUTHORIZED', 'Admin access requires localhost or valid token');
  };
}

function isLocalhostRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function validateAdminToken(request: FastifyRequest, expectedToken: string): boolean {
  if (!expectedToken) return false;

  // Check Authorization header first
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      try {
        if (crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedToken))) {
          return true;
        }
      } catch {
        // length mismatch — fall through
      }
    }
  }

  // Fallback to cookie for GUI page navigation
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
