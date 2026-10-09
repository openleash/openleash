import * as crypto from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  API_KEY_SCOPES,
  auditEventInScope,
  decodeAuditCursor,
  encodeAuditCursor,
  hashPassphrase,
  isAuditCursorNotFoundError,
  readAuditAfter,
  toOcsfEvent,
} from '@openleash/core';
import type {
  ApiKey,
  AuditCursor,
  AuditEvent,
  AuditExportScope,
  DataStore,
  OpenleashConfig,
  OrgRole,
  ServerPluginManifest,
  SessionClaims,
} from '@openleash/core';
import { createOwnerAuth } from '../middleware/owner-auth.js';
import { formatApiKeyToken, isApiKeyToken, verifyApiKey } from '../middleware/api-key-auth.js';
import { validateBody } from '../validate.js';
import { getVersion } from '../version.js';

const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
});

const ORG_ROLE_LEVEL: Record<OrgRole, number> = { org_admin: 3, org_member: 2, org_viewer: 1 };

const DEFAULT_EXPORT_LIMIT = 500;
const MAX_EXPORT_LIMIT = 1000;
/** Bound on store reads per request when scope filtering drops candidates. */
const MAX_SCAN_ROUNDS = 10;

/** The fields of an API key that are safe to return (never the hash). */
function publicApiKey(k: ApiKey) {
  return {
    api_key_id: k.api_key_id,
    name: k.name,
    scopes: k.scopes,
    status: k.status,
    created_at: k.created_at,
    created_by_user_id: k.created_by_user_id,
    revoked_at: k.revoked_at,
    last_used_at: k.last_used_at,
  };
}

/**
 * API keys and audit log export.
 *
 * API keys (`ola_…`) are long-lived machine credentials owned by a user or an
 * organization, managed by the owner (org admins for org keys). The export
 * endpoints serve the owner's audit trail as an incremental, cursor-based
 * feed in OCSF or the native format, for SIEMs and log collectors. They accept
 * either an API key with the `audit:read` scope or a normal owner session.
 */
export function registerAuditExportRoutes(
  app: FastifyInstance,
  store: DataStore,
  config: OpenleashConfig,
  pluginManifest?: ServerPluginManifest,
) {
  const ownerAuth = createOwnerAuth(config, store, pluginManifest);

  function session(request: FastifyRequest): SessionClaims {
    return (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
  }

  /** Same check as owner.ts: membership is read from the store, not the token. */
  function requireOrgRole(
    userId: string,
    orgId: string,
    minRole: OrgRole,
    reply: FastifyReply,
  ): boolean {
    const membership = store.memberships
      .listByUser(userId)
      .find((m) => m.org_id === orgId && m.status === 'active');
    if (!membership || ORG_ROLE_LEVEL[membership.role] < ORG_ROLE_LEVEL[minRole]) {
      reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Insufficient organization permissions' },
      });
      return false;
    }
    return true;
  }

  // ─── API key management ────────────────────────────────────────────

  function createApiKey(
    ownerType: 'user' | 'org',
    ownerId: string,
    createdBy: string,
    body: z.infer<typeof CreateApiKeySchema>,
  ) {
    const apiKeyId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('base64url');
    const { hash, salt } = hashPassphrase(secret);
    const apiKey: ApiKey = {
      api_key_id: apiKeyId,
      owner_type: ownerType,
      owner_id: ownerId,
      name: body.name,
      scopes: body.scopes ? [...new Set(body.scopes)] : ['audit:read'],
      token_hash: hash,
      token_salt: salt,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      created_by_user_id: createdBy,
      revoked_at: null,
      last_used_at: null,
    };
    store.apiKeys.write(apiKey);

    store.audit.append(
      'API_KEY_CREATED',
      ownerType === 'org'
        ? { org_id: ownerId, api_key_id: apiKeyId, name: apiKey.name, scopes: apiKey.scopes, created_by: createdBy }
        : { user_principal_id: ownerId, api_key_id: apiKeyId, name: apiKey.name, scopes: apiKey.scopes },
      ownerType === 'org' ? { principal_id: createdBy } : undefined,
    );

    return { ...publicApiKey(apiKey), token: formatApiKeyToken(apiKeyId, secret) };
  }

  function revokeApiKey(
    ownerType: 'user' | 'org',
    ownerId: string,
    revokedBy: string,
    apiKeyId: string,
    reply: FastifyReply,
  ) {
    let apiKey: ApiKey | null;
    try {
      apiKey = store.apiKeys.read(apiKeyId);
    } catch {
      apiKey = null;
    }
    if (!apiKey || apiKey.owner_type !== ownerType || apiKey.owner_id !== ownerId) {
      reply.code(404).send({ error: { code: 'API_KEY_NOT_FOUND', message: 'API key not found' } });
      return undefined;
    }

    if (apiKey.status !== 'REVOKED') {
      apiKey.status = 'REVOKED';
      apiKey.revoked_at = new Date().toISOString();
      store.apiKeys.write(apiKey);

      store.audit.append(
        'API_KEY_REVOKED',
        ownerType === 'org'
          ? { org_id: ownerId, api_key_id: apiKeyId, name: apiKey.name, revoked_by: revokedBy }
          : { user_principal_id: ownerId, api_key_id: apiKeyId, name: apiKey.name },
        ownerType === 'org' ? { principal_id: revokedBy } : undefined,
      );
    }

    return publicApiKey(apiKey);
  }

  function listApiKeys(ownerType: 'user' | 'org', ownerId: string) {
    return store.apiKeys
      .listByOwner(ownerType, ownerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(publicApiKey);
  }

  // Personal keys

  app.post('/v1/owner/api-keys', { preHandler: ownerAuth }, async (request, reply) => {
    const body = validateBody(request.body, CreateApiKeySchema, reply);
    if (!body) return;
    const s = session(request);
    return createApiKey('user', s.sub, s.sub, body);
  });

  app.get('/v1/owner/api-keys', { preHandler: ownerAuth }, async (request) => {
    return { api_keys: listApiKeys('user', session(request).sub) };
  });

  app.delete('/v1/owner/api-keys/:apiKeyId', { preHandler: ownerAuth }, async (request, reply) => {
    const { apiKeyId } = request.params as { apiKeyId: string };
    const s = session(request);
    return revokeApiKey('user', s.sub, s.sub, apiKeyId, reply);
  });

  // Organization keys — org admins manage them; any member may list.

  app.post('/v1/owner/organizations/:orgId/api-keys', { preHandler: ownerAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const s = session(request);
    if (!requireOrgRole(s.sub, orgId, 'org_admin', reply)) return;
    const body = validateBody(request.body, CreateApiKeySchema, reply);
    if (!body) return;
    return createApiKey('org', orgId, s.sub, body);
  });

  app.get('/v1/owner/organizations/:orgId/api-keys', { preHandler: ownerAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    if (!requireOrgRole(session(request).sub, orgId, 'org_viewer', reply)) return;
    return { api_keys: listApiKeys('org', orgId) };
  });

  app.delete(
    '/v1/owner/organizations/:orgId/api-keys/:apiKeyId',
    { preHandler: ownerAuth },
    async (request, reply) => {
      const { orgId, apiKeyId } = request.params as { orgId: string; apiKeyId: string };
      const s = session(request);
      if (!requireOrgRole(s.sub, orgId, 'org_admin', reply)) return;
      return revokeApiKey('org', orgId, s.sub, apiKeyId, reply);
    },
  );

  // ─── Audit export ──────────────────────────────────────────────────

  /** A key stops working once its owning user or organization is no longer active. */
  function ownerIsActive(apiKey: ApiKey): boolean {
    try {
      const owner = apiKey.owner_type === 'user'
        ? store.users.read(apiKey.owner_id)
        : store.organizations.read(apiKey.owner_id);
      return owner.status === 'ACTIVE';
    } catch {
      return false;
    }
  }

  /**
   * Authenticate an export request for `scope`: an `ola_` API key owned by
   * exactly that owner with `audit:read`, or an owner session that may read
   * the scope's audit log. Sends the error and returns false on failure.
   */
  async function authorizeExport(
    request: FastifyRequest,
    reply: FastifyReply,
    resolveScope: (userId: string | null, apiKey: ApiKey | null) => AuditExportScope | null,
  ): Promise<AuditExportScope | null> {
    if (isApiKeyToken(request.headers.authorization)) {
      const result = verifyApiKey(store, request.headers.authorization, 'audit:read');
      if (!result.ok) {
        reply.code(result.status).send({ error: { code: result.code, message: result.message } });
        return null;
      }
      if (!ownerIsActive(result.apiKey)) {
        reply.code(401).send({
          error: { code: 'API_KEY_OWNER_INACTIVE', message: 'The owner of this API key is no longer active' },
        });
        return null;
      }
      const scope = resolveScope(null, result.apiKey);
      if (!scope) {
        reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'API key does not belong to this owner' },
        });
      }
      return scope;
    }

    await ownerAuth(request, reply);
    if (reply.sent) return null;
    return resolveScope(session(request).sub, null);
  }

  async function sendExport(
    request: FastifyRequest,
    reply: FastifyReply,
    scope: AuditExportScope,
  ) {
    const query = request.query as {
      cursor?: string;
      since?: string;
      limit?: string;
      format?: string;
      output?: string;
    };

    const format = query.format ?? 'ocsf';
    if (format !== 'ocsf' && format !== 'native') {
      reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'format must be ocsf or native' } });
      return;
    }
    const wantsNdjson =
      query.output === 'ndjson' ||
      (query.output === undefined && (request.headers.accept ?? '').includes('application/x-ndjson'));
    if (query.output !== undefined && query.output !== 'ndjson' && query.output !== 'json') {
      reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'output must be json or ndjson' } });
      return;
    }

    const limit = query.limit
      ? Math.max(1, Math.min(parseInt(query.limit, 10) || 1, MAX_EXPORT_LIMIT))
      : DEFAULT_EXPORT_LIMIT;

    let cursor: ReturnType<typeof decodeAuditCursor> = null;
    if (query.cursor) {
      cursor = decodeAuditCursor(query.cursor);
      if (!cursor) {
        reply.code(400).send({ error: { code: 'INVALID_CURSOR', message: 'Malformed cursor' } });
        return;
      }
    }
    let since: string | null = null;
    if (!cursor && query.since) {
      if (Number.isNaN(Date.parse(query.since))) {
        reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'since must be an ISO 8601 timestamp' } });
        return;
      }
      since = new Date(query.since).toISOString();
    }

    // Candidate principals: the owner plus the agents it owns today. Events
    // about agents it owned earlier are indexed under owner_id at write time.
    const agentIds = new Set(
      store.state
        .getState()
        .agents.filter((a) => a.owner_type === scope.ownerType && a.owner_id === scope.ownerId)
        .map((a) => a.agent_principal_id),
    );
    const principalIds = new Set([scope.ownerId, ...agentIds]);

    const items: AuditEvent[] = [];
    // Where the next read resumes: the last event read, or further if the
    // store reports it scanned past non-matching events.
    let position: AuditCursor | null = cursor;
    let hasMore = false;
    try {
      for (let round = 0; round < MAX_SCAN_ROUNDS && items.length < limit; round++) {
        const page = await readAuditAfter(store.audit, principalIds, {
          afterEventId: position?.event_id ?? null,
          afterTimestamp: position?.timestamp ?? null,
          since: position ? null : since,
          limit: limit - items.length,
        });
        for (const event of page.items) {
          position = { event_id: event.event_id, timestamp: event.timestamp };
          if (auditEventInScope(event, scope, agentIds)) items.push(event);
        }
        if (page.scanned_to) position = page.scanned_to;
        hasMore = page.has_more;
        if (!hasMore) break;
      }
    } catch (err) {
      if (isAuditCursorNotFoundError(err)) {
        reply.code(410).send({
          error: { code: 'CURSOR_EXPIRED', message: 'Cursor no longer exists; restart from a since timestamp' },
        });
        return;
      }
      throw err;
    }

    const nextCursor = position ? encodeAuditCursor(position) : null;
    const productVersion = getVersion();
    const out = format === 'ocsf' ? items.map((e) => toOcsfEvent(e, { productVersion })) : items;

    if (wantsNdjson) {
      if (nextCursor) reply.header('OpenLeash-Next-Cursor', nextCursor);
      reply.header('OpenLeash-Has-More', String(hasMore));
      reply.type('application/x-ndjson');
      return out.map((e) => JSON.stringify(e) + '\n').join('');
    }
    return { format, items: out, next_cursor: nextCursor, has_more: hasMore };
  }

  // GET /v1/owner/audit/export — the caller's personal audit trail.
  app.get('/v1/owner/audit/export', async (request, reply) => {
    const scope = await authorizeExport(request, reply, (userId, apiKey) => {
      if (apiKey) return apiKey.owner_type === 'user' ? { ownerType: 'user', ownerId: apiKey.owner_id } : null;
      return { ownerType: 'user', ownerId: userId! };
    });
    if (!scope) return;
    return sendExport(request, reply, scope);
  });

  // GET /v1/owner/organizations/:orgId/audit/export — the organization's audit trail.
  app.get('/v1/owner/organizations/:orgId/audit/export', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const scope = await authorizeExport(request, reply, (userId, apiKey) => {
      if (apiKey) {
        return apiKey.owner_type === 'org' && apiKey.owner_id === orgId
          ? { ownerType: 'org', ownerId: orgId }
          : null;
      }
      // requireOrgRole sends the 403 itself.
      if (!requireOrgRole(userId!, orgId, 'org_viewer', reply)) return null;
      return { ownerType: 'org', ownerId: orgId };
    });
    if (!scope) return;
    return sendExport(request, reply, scope);
  });
}
