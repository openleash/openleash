import type { FastifyRequest, FastifyReply } from 'fastify';
import type { OpenleashConfig } from '@openleash/core';

export function createAdminAuth(config: OpenleashConfig) {
  return async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
    const mode = config.admin.mode;
    const isLocalhost = isLocalhostRequest(request);

    if (mode === 'localhost') {
      if (!isLocalhost && !config.admin.allow_remote_admin) {
        reply.code(403).send({
          error: { code: 'ADMIN_FORBIDDEN', message: 'Admin access requires localhost connection' },
        });
        return;
      }
      return; // localhost access allowed
    }

    if (mode === 'token') {
      if (!validateToken(request, config.admin.token)) {
        reply.code(401).send({
          error: { code: 'ADMIN_UNAUTHORIZED', message: 'Invalid or missing admin token' },
        });
        return;
      }
      return;
    }

    // localhost_or_token
    if (isLocalhost) {
      return; // localhost bypass
    }
    if (config.admin.allow_remote_admin && validateToken(request, config.admin.token)) {
      return;
    }
    if (!config.admin.allow_remote_admin) {
      // For local requests, token also works
      if (validateToken(request, config.admin.token)) {
        return;
      }
    }

    reply.code(401).send({
      error: { code: 'ADMIN_UNAUTHORIZED', message: 'Admin access requires localhost or valid token' },
    });
  };
}

function isLocalhostRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function validateToken(request: FastifyRequest, expectedToken: string): boolean {
  if (!expectedToken) return false;
  const authHeader = request.headers.authorization;
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return false;
  return parts[1] === expectedToken;
}
