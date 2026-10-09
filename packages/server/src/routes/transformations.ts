import * as crypto from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  NonceCache, TransformationRule, activeTransformation, compareTransformations,
  effectiveTransformations, writeTransformation, removeTransformation, verifyTotp, verifyBackupCode,
} from '@openleash/core';
import type { DataStore, OpenleashConfig, ServerPluginManifest, SessionClaims, StateAgentEntry, TransformationFrontmatter, Provisioner } from '@openleash/core';
import { createAgentAuth } from '../middleware/agent-auth.js';
import { createOwnerAuth } from '../middleware/owner-auth.js';
import { createAdminAuth } from '../middleware/admin-auth.js';
import { createProvisionerAuth } from '../middleware/provisioner-auth.js';
import { validateBody } from '../validate.js';
import { previewTransformation } from '../transformation-preview.js';

const fields = {
  rule: TransformationRule,
  name: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  applies_to_agent_principal_id: z.string().uuid().nullable().optional(),
  applies_to_group_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  failure_policy: z.enum(['block', 'continue']).optional(),
};
const Create = z.object(fields).strict();
const Update = z.object({ ...fields, rule: TransformationRule.optional(), revision: z.number().int().positive().optional() }).strict();
const Order = z.object({ ordered_transformation_ids: z.array(z.string().uuid()).max(500) }).strict();
const Preview = z.object({ rule: TransformationRule, input: z.string().max(65536) }).strict();
const Draft = z.object({ rule: TransformationRule, name: fields.name, description: fields.description, justification: z.string().trim().min(1).max(2000) }).strict();
const Resolution = z.object({ totp_code: z.string().optional(), reason: z.string().max(500).optional() }).strict();
const Report = z.object({
  report_token: z.string().max(100000), action_id: z.string().uuid().optional(), tool_call_id: z.string().uuid(),
  outcome: z.enum(['completed', 'blocked', 'shadow']),
  results: z.array(z.object({
    transformation_id: z.string().uuid(), revision: z.number().int().positive(),
    status: z.enum(['applied', 'unchanged', 'skipped', 'failed']),
    chars_before: z.number().int().min(0).max(1048576).optional(), chars_after: z.number().int().min(0).max(1048576).optional(),
    reason: z.enum(['invalid_rule', 'execution_timeout', 'output_limit', 'execution_error', 'shadow_mode', 'previous_failure']).optional(),
  }).strict()).max(500),
}).strict();

type Scope = { owner_type: 'user' | 'org'; owner_id: string };
const params = (r: FastifyRequest) => r.params as Record<string, string>;
const session = (r: FastifyRequest) => (r as unknown as { ownerSession: SessionClaims }).ownerSession;
const agent = (r: FastifyRequest) => (r as unknown as { agentEntry: StateAgentEntry }).agentEntry;
function fail(reply: FastifyReply, code: number, message: string, error = 'INVALID_REQUEST') {
  reply.code(code).send({ error: { code: error, message } });
}
const sameOwner = (a: Scope, b: Scope) => a.owner_type === b.owner_type && a.owner_id === b.owner_id;
const normalized = (t: TransformationFrontmatter) => ({ ...t, revision: t.revision ?? 1, failure_policy: t.failure_policy ?? 'block', applies_to_group_id: t.applies_to_group_id ?? null });

export function registerTransformationRoutes(app: FastifyInstance, store: DataStore, config: OpenleashConfig, nonceCache: NonceCache, pluginManifest?: ServerPluginManifest) {
  const ownerAuth = createOwnerAuth(config, store, pluginManifest);
  const agentAuth = createAgentAuth(config, store, nonceCache);
  const adminAuth = createAdminAuth(config, store, pluginManifest);
  const provisionerAuth = createProvisionerAuth(store);
  function scope(request: FastifyRequest, reply: FastifyReply, write = false): Scope | null {
    const orgId = params(request).orgId;
    if (!orgId) return { owner_type: 'user', owner_id: session(request).sub };
    const member = store.memberships.listByUser(session(request).sub).find(m => m.org_id === orgId && m.status === 'active');
    if (!member || (write && member.role !== 'org_admin')) { fail(reply, 403, 'Insufficient organization permissions', 'FORBIDDEN'); return null; }
    return { owner_type: 'org', owner_id: orgId };
  }
  function find(id: string, owner: Scope, reply: FastifyReply): TransformationFrontmatter | null {
    if (!z.string().uuid().safeParse(id).success) { fail(reply, 404, 'Transformation not found', 'NOT_FOUND'); return null; }
    try {
      const record = store.transformations.read(id);
      if (sameOwner(record, owner)) return record;
    } catch { /* Not found. */ }
    fail(reply, 404, 'Transformation not found', 'NOT_FOUND'); return null;
  }
  function checkTargets(record: TransformationFrontmatter, reply: FastifyReply): boolean {
    const aid = record.applies_to_agent_principal_id, gid = record.applies_to_group_id;
    if (aid && gid) { fail(reply, 400, 'Choose either an agent or a group'); return false; }
    if (aid) {
      const target = store.state.getState().agents.find(a => a.agent_principal_id === aid && sameOwner(a, record));
      if (!target) { fail(reply, 400, 'Agent does not belong to this owner', 'INVALID_AGENT'); return false; }
    }
    if (gid) {
      if (record.owner_type !== 'org' || !store.policyGroups.listByOwner('org', record.owner_id).some(g => g.group_id === gid)) {
        fail(reply, 400, 'Group does not belong to this organization', 'INVALID_GROUP'); return false;
      }
    }
    return true;
  }
  function audit(type: string, owner: Scope, metadata: Record<string, unknown>, request?: FastifyRequest) {
    store.audit.append(type, { owner_type: owner.owner_type, owner_id: owner.owner_id, ...metadata, ...(request ? { user_principal_id: session(request).sub } : {}) }, {
      principal_id: request ? session(request).sub : typeof metadata.agent_principal_id === 'string' ? metadata.agent_principal_id : owner.owner_id,
      action_id: typeof metadata.action_id === 'string' ? metadata.action_id : null,
    });
  }
  function requireTotp(request: FastifyRequest, reply: FastifyReply): boolean {
    const user = store.users.read(session(request).sub);
    if (config.security.require_totp && !user.totp_enabled) { fail(reply, 403, 'Set up two-factor authentication first', 'TOTP_SETUP_REQUIRED'); return false; }
    if (!user.totp_enabled) return true;
    const code = (request.body as { totp_code?: string } | undefined)?.totp_code;
    if (!code) { fail(reply, 403, 'Two-factor authentication code is required', 'TOTP_REQUIRED'); return false; }
    if (user.totp_secret_b32 && verifyTotp(user.totp_secret_b32, code)) return true;
    const backup = verifyBackupCode(code, user.totp_backup_codes_hash ?? []);
    if (backup.valid) { user.totp_backup_codes_hash = backup.remainingHashes; store.users.write(user); return true; }
    fail(reply, 403, 'Invalid two-factor authentication code', 'INVALID_TOTP'); return false;
  }
  function create(owner: Scope, body: z.infer<typeof Create>): TransformationFrontmatter {
    const existing = store.transformations.listByOwner(owner.owner_type, owner.owner_id);
    return {
      owner_type: owner.owner_type, owner_id: owner.owner_id, transformation_id: crypto.randomUUID(), applies_to_agent_principal_id: body.applies_to_agent_principal_id ?? null,
      applies_to_group_id: body.applies_to_group_id ?? null, name: body.name || null, description: body.description || null,
      enabled: body.enabled ?? true, failure_policy: body.failure_policy ?? 'block', revision: 1,
      rank: Math.max(0, ...existing.map(t => t.rank)) + 100, rule: body.rule, created_at: new Date().toISOString(),
    };
  }
  function bump(t: TransformationFrontmatter) { t.revision = (t.revision ?? 1) + 1; t.updated_at = new Date().toISOString(); }

  for (const base of ['/v1/owner', '/v1/owner/organizations/:orgId']) {
    app.get(base + '/transformations', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply); if (!owner) return;
      return { transformations: store.transformations.listByOwner(owner.owner_type, owner.owner_id).filter(activeTransformation).sort(compareTransformations).map(normalized) };
    });
    app.post(base + '/transformations', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply, true); if (!owner) return;
      const body = validateBody(r.body, Create, reply); if (!body) return;
      if (store.transformations.listByOwner(owner.owner_type, owner.owner_id).filter(activeTransformation).length >= 500) { fail(reply, 409, 'An owner can have at most 500 active transformations', 'TRANSFORMATION_LIMIT'); return; }
      const record = create(owner, body); if (!checkTargets(record, reply)) return;
      writeTransformation(store, record);
      audit('TRANSFORMATION_CREATED', owner, { transformation_id: record.transformation_id, revision: 1, rule_type: record.rule.type, name: record.name, configuration: normalized(record) }, r);
      return { transformation_id: record.transformation_id, revision: 1, status: 'created' };
    });
    app.post(base + '/transformations/preview', { preHandler: ownerAuth }, async (r, reply) => {
      if (!scope(r, reply)) return;
      const body = validateBody(r.body, Preview, reply); if (!body) return;
      try { return await previewTransformation(body.rule, body.input); }
      catch (e) { fail(reply, 422, (e as Error).message, 'TRANSFORMATION_FAILED'); }
    });
    app.put(base + '/transformations/order', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply, true); if (!owner) return;
      const body = validateBody(r.body, Order, reply); if (!body) return;
      const records = store.transformations.listByOwner(owner.owner_type, owner.owner_id).filter(activeTransformation);
      const ids = body.ordered_transformation_ids;
      if (new Set(ids).size !== ids.length || ids.length !== records.length || records.some(t => !ids.includes(t.transformation_id))) {
        fail(reply, 409, 'Supply every transformation in this owner scope exactly once; reload before reordering', 'ORDER_CONFLICT'); return;
      }
      ids.forEach((id, i) => { const t = records.find(t => t.transformation_id === id)!; t.rank = (i + 1) * 100; bump(t); writeTransformation(store, t); });
      audit('TRANSFORMATIONS_REORDERED', owner, { ordered_transformation_ids: ids, revisions: records.map(t => ({ transformation_id: t.transformation_id, revision: t.revision, rank: t.rank })) }, r);
      return { reordered: ids.length };
    });
    app.get(base + '/transformations/:id', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply); if (!owner) return;
      const record = find(params(r).id, owner, reply); if (!record) return;
      if (!activeTransformation(record)) { fail(reply, 404, 'Transformation not active', 'NOT_FOUND'); return; }
      return normalized(record);
    });
    app.put(base + '/transformations/:id', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply, true); if (!owner) return;
      const body = validateBody(r.body, Update, reply); if (!body) return;
      const record = find(params(r).id, owner, reply); if (!record) return;
      if (!activeTransformation(record)) { fail(reply, 409, 'Resolve the draft before editing'); return; }
      if (body.revision !== undefined && body.revision !== (record.revision ?? 1)) { fail(reply, 409, 'Rule changed; reload before saving', 'REVISION_CONFLICT'); return; }
      const before = normalized(record);
      const changes = { ...body };
      delete changes.revision;
      const updated = { ...record, ...changes };
      if (!checkTargets(updated, reply)) return;
      bump(updated); writeTransformation(store, updated);
      audit('TRANSFORMATION_UPDATED', owner, { transformation_id: record.transformation_id, revision: updated.revision, changed_fields: Object.keys(changes), previous_revision: before.revision, name: updated.name, configuration: normalized(updated) }, r);
      return { transformation_id: record.transformation_id, revision: updated.revision, status: 'updated' };
    });
    app.delete(base + '/transformations/:id', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply, true); if (!owner) return;
      const record = find(params(r).id, owner, reply); if (!record || !requireTotp(r, reply)) return;
      removeTransformation(store, record.transformation_id);
      audit('TRANSFORMATION_DELETED', owner, { transformation_id: record.transformation_id, revision: record.revision ?? 1, name: record.name }, r);
      return { status: 'deleted' };
    });
    app.get(base + '/transformation-drafts', { preHandler: ownerAuth }, async (r, reply) => {
      const owner = scope(r, reply); if (!owner) return;
      return { drafts: store.transformations.listByOwner(owner.owner_type, owner.owner_id).filter(t => t.draft).map(normalized) };
    });
    for (const action of ['approve', 'deny'] as const) {
      app.post(base + '/transformation-drafts/:id/' + action, { preHandler: ownerAuth }, async (r, reply) => {
        const owner = scope(r, reply, true); if (!owner) return;
        const body = validateBody(r.body ?? {}, Resolution, reply); if (!body) return;
        const record = find(params(r).id, owner, reply); if (!record) return;
        if (record.draft?.status !== 'PENDING') { fail(reply, 409, 'Draft has already been resolved', 'DRAFT_CONFLICT'); return; }
        if (!requireTotp(r, reply)) return;
        if (action === 'approve' && !checkTargets(record, reply)) return;
        if (action === 'approve') {
          const active = store.transformations.listByOwner(owner.owner_type, owner.owner_id).filter(activeTransformation);
          if (active.length >= 500) { fail(reply, 409, 'An owner can have at most 500 active transformations', 'TRANSFORMATION_LIMIT'); return; }
          record.rank = Math.max(0, ...active.map(t => t.rank)) + 100;
        }
        record.draft.status = action === 'approve' ? 'APPROVED' : 'DENIED';
        record.draft.resolved_at = new Date().toISOString(); record.draft.denial_reason = action === 'deny' ? body.reason : undefined;
        record.enabled = action === 'approve'; bump(record); writeTransformation(store, record);
        audit('TRANSFORMATION_DRAFT_' + record.draft.status, owner, { transformation_id: record.transformation_id, agent_principal_id: record.draft.agent_principal_id, revision: record.revision, configuration: normalized(record) }, r);
        return { transformation_id: record.transformation_id, status: record.draft.status };
      });
    }
  }

  app.get('/v1/admin/transformations', { preHandler: adminAuth }, async () => ({ transformations: (store.state.getState().transformations ?? []).flatMap(t => {
    try { return [normalized(store.transformations.read(t.transformation_id))]; } catch { return []; }
  }).sort(compareTransformations) }));
  app.get('/v1/admin/transformations/:id', { preHandler: adminAuth }, async (r, reply) => {
    const entry = (store.state.getState().transformations ?? []).find(t => t.transformation_id === params(r).id);
    if (!entry) { fail(reply, 404, 'Transformation not found', 'NOT_FOUND'); return; }
    const record = find(entry.transformation_id, entry, reply); if (record) return normalized(record);
  });
  app.get('/v1/agent/transformation-drafts', { preHandler: agentAuth }, async r => {
    const a = agent(r);
    return { drafts: store.transformations.listByOwner(a.owner_type, a.owner_id).filter(t => t.draft?.agent_principal_id === a.agent_principal_id).map(normalized) };
  });
  app.post('/v1/agent/transformation-drafts', { preHandler: agentAuth }, async (r, reply) => {
    const body = validateBody(r.body, Draft, reply); if (!body) return;
    const a = agent(r);
    const pending = store.transformations.listByOwner(a.owner_type, a.owner_id).filter(t => t.draft?.status === 'PENDING' && t.draft.agent_principal_id === a.agent_principal_id);
    if (pending.length >= 20) { fail(reply, 429, 'Resolve pending drafts before proposing more', 'DRAFT_LIMIT'); return; }
    const record = create(a, { rule: body.rule, name: body.name, description: body.description, applies_to_agent_principal_id: a.agent_principal_id, enabled: false });
    record.draft = { status: 'PENDING', agent_principal_id: a.agent_principal_id, justification: body.justification };
    writeTransformation(store, record);
    audit('TRANSFORMATION_DRAFT_CREATED', a, { transformation_id: record.transformation_id, agent_principal_id: a.agent_principal_id });
    return { transformation_id: record.transformation_id, status: 'PENDING' };
  });

  // Signed report tokens bind the runtime's report to the rule revisions it fetched.
  const snapshotSchema = z.object({
    purpose: z.literal('transformation-report'), expires: z.number(), agent_principal_id: z.string(),
    owner_type: z.enum(['user', 'org']), owner_id: z.string(),
    rules: z.array(z.object({ transformation_id: z.string().uuid(), revision: z.number() })),
  });
  function signSnapshot(value: z.infer<typeof snapshotSchema>) {
    const kid = store.state.getState().server_keys.active_kid;
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    const mac = crypto.createHmac('sha256', store.keys.read(kid).private_key_b64).update('transformation-report:' + payload).digest('base64url');
    return kid + '.' + payload + '.' + mac;
  }
  app.get('/v1/agent/transformations', { preHandler: agentAuth }, async r => {
    const a = agent(r), records = effectiveTransformations(store, a);
    const transformations = records.map(t => ({ transformation_id: t.transformation_id, name: t.name, rank: t.rank, revision: t.revision ?? 1, failure_policy: t.failure_policy ?? 'block', ...t.rule }));
    return { protocol_version: 1, transformations, report_token: signSnapshot({ purpose: 'transformation-report', expires: Date.now() + 600000, agent_principal_id: a.agent_principal_id, owner_type: a.owner_type, owner_id: a.owner_id, rules: transformations.map(t => ({ transformation_id: t.transformation_id, revision: t.revision })) }) };
  });
  app.post('/v1/agent/transformation-results', { preHandler: agentAuth }, async (r, reply) => {
    const body = validateBody(r.body, Report, reply); if (!body) return;
    let snapshot: z.infer<typeof snapshotSchema>;
    try {
      const [kid, payload, mac, extra] = body.report_token.split('.');
      if (extra || !kid || !payload || !mac || !store.state.getState().server_keys.keys.some(k => k.kid === kid)) throw new Error();
      const expected = crypto.createHmac('sha256', store.keys.read(kid).private_key_b64).update('transformation-report:' + payload).digest();
      if (!crypto.timingSafeEqual(expected, Buffer.from(mac, 'base64url'))) throw new Error();
      snapshot = snapshotSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
      if (snapshot.expires < Date.now() || snapshot.agent_principal_id !== agent(r).agent_principal_id) throw new Error();
    } catch { fail(reply, 400, 'Invalid or expired transformation report token', 'INVALID_REPORT'); return; }
    if (new Set(body.results.map(t => t.transformation_id)).size !== body.results.length || body.results.length !== snapshot.rules.length || body.results.some(t => !snapshot.rules.some(s => s.transformation_id === t.transformation_id && s.revision === t.revision))) {
      fail(reply, 400, 'Report must account for every fetched rule revision exactly once', 'INVALID_REPORT'); return;
    }
    audit('TRANSFORMATION_EXECUTION_REPORTED', snapshot, { agent_principal_id: agent(r).agent_principal_id, tool_call_id: body.tool_call_id, action_id: body.action_id, outcome: body.outcome, results: body.results, evidence: 'runtime_reported' });
    return { status: 'recorded' };
  });

  const provisioner = (r: FastifyRequest) => (r as unknown as { provisioner: Provisioner }).provisioner;
  app.get('/v1/provisioner/transformations', { preHandler: provisionerAuth }, async r => {
    const p = provisioner(r);
    return { transformations: store.transformations.listByOwner(p.owner_type, p.owner_id).filter(activeTransformation).sort(compareTransformations).map(normalized) };
  });
  for (const method of ['POST', 'DELETE'] as const) {
    app.route({ method, url: '/v1/provisioner/agents/:agentId/transformations/:id', preHandler: provisionerAuth, handler: async (r, reply) => {
      const p = provisioner(r), aid = params(r).agentId;
      const a = store.state.getState().agents.find(a => a.agent_principal_id === aid && sameOwner(a, p));
      if (!a) { fail(reply, 404, 'Agent not found', 'NOT_FOUND'); return; }
      const t = find(params(r).id, p, reply); if (!t) return;
      if (!activeTransformation(t)) { fail(reply, 409, 'Drafts cannot be bound'); return; }
      store.state.updateState(s => {
        s.transformation_bindings = (s.transformation_bindings ?? []).filter(b => !(b.transformation_id === t.transformation_id && b.agent_principal_id === aid));
        if (method === 'POST') s.transformation_bindings.push({ transformation_id: t.transformation_id, agent_principal_id: aid, owner_type: p.owner_type, owner_id: p.owner_id });
      });
      audit(method === 'POST' ? 'TRANSFORMATION_BOUND' : 'TRANSFORMATION_UNBOUND', p, { transformation_id: t.transformation_id, agent_principal_id: aid, provisioner_id: p.provisioner_id });
      return { status: method === 'POST' ? 'bound' : 'unbound' };
    } });
  }
}
