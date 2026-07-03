import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { hashPassphrase } from '@openleash/core';
import type { DataStore, Provisioner } from '@openleash/core';

export const PROVISIONER_TOKEN_PREFIX = 'olp_';

/** How stale last_used_at may get before we bother rewriting the file. */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Build a provisioner bearer token. The provisioner_id travels inside the
 * token so the server can look up the stored hash without an extra header.
 */
export function formatProvisionerToken(provisionerId: string, secret: string): string {
  return `${PROVISIONER_TOKEN_PREFIX}${provisionerId}.${secret}`;
}

export function parseProvisionerToken(
  token: string,
): { provisionerId: string; secret: string } | null {
  if (!token.startsWith(PROVISIONER_TOKEN_PREFIX)) return null;
  const rest = token.slice(PROVISIONER_TOKEN_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return null;
  return { provisionerId: rest.slice(0, dot), secret: rest.slice(dot + 1) };
}

/**
 * Auth middleware for the provisioner scope (`/v1/provisioner/*`).
 *
 * Verifies `Authorization: Bearer olp_<provisioner_id>.<secret>` against the
 * stored scrypt hash and attaches the provisioner record to the request as
 * `request.provisioner`.
 */
export function createProvisionerAuth(store: DataStore) {
  return async function provisionerAuth(request: FastifyRequest, reply: FastifyReply) {
    function deny(code: string, message: string) {
      reply.code(401).send({ error: { code, message } });
    }

    const authHeader = request.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      deny('PROVISIONER_UNAUTHORIZED', 'Provisioner access requires a Bearer token');
      return;
    }

    const parsed = parseProvisionerToken(authHeader.slice(7));
    if (!parsed) {
      deny('PROVISIONER_UNAUTHORIZED', 'Malformed provisioner token');
      return;
    }

    let provisioner: Provisioner;
    try {
      provisioner = store.provisioners.read(parsed.provisionerId);
    } catch {
      deny('PROVISIONER_UNAUTHORIZED', 'Unknown provisioner');
      return;
    }

    const { hash } = hashPassphrase(parsed.secret, provisioner.token_salt);
    let matches: boolean;
    try {
      matches = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(provisioner.token_hash));
    } catch {
      matches = false;
    }
    if (!matches) {
      deny('PROVISIONER_UNAUTHORIZED', 'Invalid provisioner token');
      return;
    }

    if (provisioner.status !== 'ACTIVE') {
      deny('PROVISIONER_REVOKED', 'Provisioner has been revoked');
      return;
    }

    const now = Date.now();
    const lastUsed = provisioner.last_used_at ? Date.parse(provisioner.last_used_at) : 0;
    if (now - lastUsed > LAST_USED_WRITE_INTERVAL_MS) {
      provisioner.last_used_at = new Date(now).toISOString();
      store.provisioners.write(provisioner);
    }

    (request as unknown as Record<string, unknown>).provisioner = provisioner;
  };
}
