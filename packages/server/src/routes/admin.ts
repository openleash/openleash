import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  validateUserIdentity,
  validateGovernmentIdValue,
  validateCompanyIdValue,
  validateDomainName,
  computeUserAssuranceLevel,
  computeOrgAssuranceLevel,
  hashPassphrase,
  resolveSystemRoles,
} from '@openleash/core';
import type {
  DataStore,
  OpenleashConfig,
  OpenleashEvents,
  UserFrontmatter,
  OrganizationFrontmatter,
  ContactIdentity,
  GovernmentId,
  CompanyId,
  OrgDomain,
  Signatory,
  SignatoryRule,
  SystemRole,
  ServerPluginManifest,
} from '@openleash/core';
import { SystemRole as SystemRoleEnum } from '@openleash/core';
import { createAdminAuth } from '../middleware/admin-auth.js';
import type { AdminSession } from '../middleware/admin-auth.js';
import { validateBody } from '../validate.js';
import { CreateUserSchema, CreateOrgSchema } from '@openleash/gui';
import { cascadeDeleteAgent, cascadeDeleteOrg, cascadeDeleteUser } from '../cascade.js';

export function registerAdminRoutes(app: FastifyInstance, store: DataStore, config: OpenleashConfig, events: OpenleashEvents, pluginManifest?: ServerPluginManifest) {
  const adminAuth = createAdminAuth(config, store, pluginManifest);

  function getAdminSession(request: unknown): AdminSession | undefined {
    return (request as Record<string, unknown>).adminSession as AdminSession | undefined;
  }

  // POST /v1/admin/login
  app.post('/v1/admin/login', { preHandler: adminAuth }, async (request) => {
    const session = getAdminSession(request);
    return {
      ok: true,
      principal_id: session?.principal_id ?? null,
      auth_method: session?.auth_method ?? null,
    };
  });

  // ─── User management ──────────────────────────────────────────────

  // POST /v1/admin/users
  app.post('/v1/admin/users', { preHandler: adminAuth }, async (request, reply) => {
    const validated = validateBody(request.body, CreateUserSchema, reply);
    if (!validated) return;

    const body = request.body as {
      display_name: string;
      contact_identities?: ContactIdentity[];
      government_ids?: GovernmentId[];
    };

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const contacts = (body.contact_identities ?? []).map((c) => ({
      ...c,
      contact_id: c.contact_id || crypto.randomUUID(),
      verified: c.verified ?? false,
      verified_at: c.verified_at ?? null,
      added_at: c.added_at || now,
    }));

    const govIds = (body.government_ids ?? []).map((g) => ({
      ...g,
      verification_level: g.verification_level || 'UNVERIFIED',
      verified_at: g.verified_at ?? null,
      added_at: g.added_at || now,
    }));

    for (const g of govIds) {
      if (g.verification_level === 'UNVERIFIED') {
        const result = validateGovernmentIdValue(g.country, g.id_type, g.id_value);
        if (result.valid) g.verification_level = 'FORMAT_VALID';
      }
    }

    const user: UserFrontmatter = {
      user_principal_id: userId,
      display_name: body.display_name,
      status: 'ACTIVE',
      attributes: {},
      created_at: now,
      ...(contacts.length > 0 && { contact_identities: contacts }),
      ...(govIds.length > 0 && { government_ids: govIds }),
    };

    const validation = validateUserIdentity(user);
    if (validation.type_errors.length > 0) {
      reply.code(400).send({
        error: { code: 'INVALID_IDENTITY', message: validation.type_errors.join('; ') },
      });
      return;
    }

    user.identity_assurance_level = computeUserAssuranceLevel(user);

    store.users.write(user);

    store.state.updateState((s) => {
      s.users.push({
        user_principal_id: userId,
        path: `./users/${userId}.md`,
      });
    });

    store.audit.append('USER_CREATED', {
      user_principal_id: userId,
      display_name: body.display_name,
      identity_assurance_level: user.identity_assurance_level ?? null,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return {
      user_principal_id: userId,
      display_name: body.display_name,
      status: 'ACTIVE',
      identity_assurance_level: user.identity_assurance_level,
      created_at: now,
    };
  });

  // ─── Organization management ──────────────────────────────────────

  // POST /v1/admin/organizations
  app.post('/v1/admin/organizations', { preHandler: adminAuth }, async (request, reply) => {
    const validated = validateBody(request.body, CreateOrgSchema, reply);
    if (!validated) return;

    const body = request.body as {
      display_name: string;
      created_by_user_id: string;
      contact_identities?: ContactIdentity[];
      company_ids?: CompanyId[];
      domains?: OrgDomain[];
      signatories?: Signatory[];
      signatory_rules?: SignatoryRule[];
    };

    const orgId = crypto.randomUUID();
    const now = new Date().toISOString();

    const contacts = (body.contact_identities ?? []).map((c) => ({
      ...c,
      contact_id: c.contact_id || crypto.randomUUID(),
      verified: c.verified ?? false,
      verified_at: c.verified_at ?? null,
      added_at: c.added_at || now,
    }));

    const companyIds = (body.company_ids ?? []).map((c) => ({
      ...c,
      verification_level: c.verification_level || 'UNVERIFIED',
      verified_at: c.verified_at ?? null,
      added_at: c.added_at || now,
    }));

    for (const c of companyIds) {
      if (c.verification_level === 'UNVERIFIED') {
        const result = validateCompanyIdValue(c.id_type, c.id_value, c.country);
        if (result.valid) c.verification_level = 'FORMAT_VALID';
      }
    }

    const domains = (body.domains ?? []).map((d) => {
      const result = validateDomainName(d.domain);
      return {
        ...d,
        domain_id: d.domain_id || crypto.randomUUID(),
        domain: d.domain.trim().toLowerCase(),
        verification_level: result.valid ? 'FORMAT_VALID' as const : 'UNVERIFIED' as const,
        verified_at: d.verified_at ?? null,
        added_at: d.added_at || now,
      };
    });

    const signatories = (body.signatories ?? []).map((s) => ({
      ...s,
      signatory_id: s.signatory_id || crypto.randomUUID(),
      valid_until: s.valid_until ?? null,
      added_at: s.added_at || now,
    }));

    const signatoryRules = (body.signatory_rules ?? []).map((r) => ({
      ...r,
      rule_id: r.rule_id || crypto.randomUUID(),
    }));

    const org: OrganizationFrontmatter = {
      org_id: orgId,
      display_name: body.display_name,
      status: 'ACTIVE',
      attributes: {},
      created_at: now,
      created_by_user_id: body.created_by_user_id,
      verification_status: 'unverified',
      ...(contacts.length > 0 && { contact_identities: contacts }),
      ...(companyIds.length > 0 && { company_ids: companyIds }),
      ...(domains.length > 0 && { domains }),
      ...(signatories.length > 0 && { signatories }),
      ...(signatoryRules.length > 0 && { signatory_rules: signatoryRules }),
    };

    org.identity_assurance_level = computeOrgAssuranceLevel(org);

    store.organizations.write(org);

    // Create org_admin membership for the creating user
    const membershipId = crypto.randomUUID();
    store.memberships.write({
      membership_id: membershipId,
      org_id: orgId,
      user_principal_id: body.created_by_user_id,
      role: 'org_admin',
      status: 'active',
      invited_by_user_id: null,
      created_at: now,
    });

    store.state.updateState((s) => {
      s.organizations.push({
        org_id: orgId,
        path: `./organizations/${orgId}.md`,
      });
      s.memberships.push({
        membership_id: membershipId,
        org_id: orgId,
        user_principal_id: body.created_by_user_id,
        role: 'org_admin',
        path: `./memberships/${membershipId}.json`,
      });
    });

    store.audit.append('ORG_CREATED', {
      org_id: orgId,
      display_name: body.display_name,
      created_by_user_id: body.created_by_user_id,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    // Emit verification request for contacts provided at creation
    for (const contact of contacts) {
      if (!contact.verified) {
        events.emit('contact_verification.requested', {
          contact_id: contact.contact_id,
          type: contact.type,
          value: contact.value,
          owner_type: 'org',
          owner_id: orgId,
          requested_by_user_id: body.created_by_user_id,
        });
      }
    }

    return {
      org_id: orgId,
      display_name: body.display_name,
      status: 'ACTIVE',
      created_by_user_id: body.created_by_user_id,
      created_at: now,
    };
  });

  // ─── Setup invite ──────────────────────────────────────────────────

  // POST /v1/admin/users/:userId/setup-invite
  app.post('/v1/admin/users/:userId/setup-invite', { preHandler: adminAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const state = store.state.getState();
    const userEntry = state.users.find((u) => u.user_principal_id === userId);
    if (!userEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    store.setupInvites.write({
      invite_id: inviteId,
      user_principal_id: userId,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    const adminPrincipalId = getAdminSession(request)?.principal_id ?? null;

    store.audit.append('USER_SETUP_INVITE_CREATED', {
      user_principal_id: userId,
      invite_id: inviteId,
      expires_at: expiresAt,
    }, { principal_id: adminPrincipalId });

    const user = store.users.read(userId);
    const emailContact = user.contact_identities?.find((c) => c.type === 'EMAIL');
    events.emit('user_setup_invite.created', {
      invite_id: inviteId,
      invite_token: inviteToken,
      user_principal_id: userId,
      display_name: user.display_name,
      email: emailContact?.value ?? null,
      expires_at: expiresAt,
      created_by_user_id: adminPrincipalId,
    });

    return {
      invite_id: inviteId,
      invite_token: inviteToken,
      expires_at: expiresAt,
    };
  });

  // POST /v1/admin/users/:userId/agent-invite
  app.post('/v1/admin/users/:userId/agent-invite', { preHandler: adminAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const state = store.state.getState();
    const userEntry = state.users.find((u) => u.user_principal_id === userId);
    if (!userEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    store.agentInvites.write({
      invite_id: inviteId,
      owner_type: 'user',
      owner_id: userId,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    store.audit.append('AGENT_INVITE_CREATED', {
      owner_type: 'user',
      owner_id: userId,
      invite_id: inviteId,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return {
      invite_id: inviteId,
      invite_token: inviteToken,
      expires_at: expiresAt,
    };
  });

  // POST /v1/admin/organizations/:orgId/agent-invite
  app.post('/v1/admin/organizations/:orgId/agent-invite', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const state = store.state.getState();
    const orgEntry = state.organizations.find((o) => o.org_id === orgId);
    if (!orgEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      });
      return;
    }

    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    store.agentInvites.write({
      invite_id: inviteId,
      owner_type: 'org',
      owner_id: orgId,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    store.audit.append('AGENT_INVITE_CREATED', {
      owner_type: 'org',
      owner_id: orgId,
      invite_id: inviteId,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return {
      invite_id: inviteId,
      invite_token: inviteToken,
      expires_at: expiresAt,
    };
  });

  // DELETE /v1/admin/users/:userId
  app.delete('/v1/admin/users/:userId', { preHandler: adminAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const state = store.state.getState();

    if (!state.users.find((u) => u.user_principal_id === userId)) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    const summary = cascadeDeleteUser(store, userId);

    store.audit.append('USER_DELETED', {
      user_principal_id: userId,
      ...summary,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return { user_principal_id: userId, status: 'deleted', ...summary };
  });

  // POST /v1/admin/users/:userId/disable-totp
  app.post('/v1/admin/users/:userId/disable-totp', { preHandler: adminAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const state = store.state.getState();
    const userEntry = state.users.find((u) => u.user_principal_id === userId);
    if (!userEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    const user = store.users.read(userId);
    if (!user.totp_enabled) {
      reply.code(400).send({
        error: { code: 'TOTP_NOT_ENABLED', message: 'TOTP is not enabled for this user' },
      });
      return;
    }

    delete user.totp_secret_b32;
    delete user.totp_enabled;
    delete user.totp_enabled_at;
    delete user.totp_backup_codes_hash;
    store.users.write(user);

    store.audit.append('USER_TOTP_DISABLED', {
      user_principal_id: userId,
      disabled_by: 'admin',
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return { user_principal_id: userId, status: 'totp_disabled' };
  });

  // ─── System role management ─────────────────────────────────────────

  // GET /v1/admin/users/:userId/roles
  app.get('/v1/admin/users/:userId/roles', { preHandler: adminAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const state = store.state.getState();
    const userEntry = state.users.find((u) => u.user_principal_id === userId);
    if (!userEntry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    const user = store.users.read(userId);
    return { user_principal_id: userId, system_roles: resolveSystemRoles(user) };
  });

  // PUT /v1/admin/users/:userId/roles
  app.put('/v1/admin/users/:userId/roles', { preHandler: adminAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const body = request.body as { system_roles?: unknown };

    if (!body.system_roles || !Array.isArray(body.system_roles)) {
      reply.code(400).send({ error: { code: 'INVALID_BODY', message: 'system_roles must be an array' } });
      return;
    }

    const roles: SystemRole[] = [];
    for (const r of body.system_roles) {
      const parsed = SystemRoleEnum.safeParse(r);
      if (!parsed.success) {
        reply.code(400).send({
          error: { code: 'INVALID_ROLE', message: `Invalid role: ${r}. Valid roles: admin` },
        });
        return;
      }
      roles.push(parsed.data);
    }

    const state = store.state.getState();
    const userEntry = state.users.find((u) => u.user_principal_id === userId);
    if (!userEntry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    const user = store.users.read(userId);
    const previousRoles = resolveSystemRoles(user);
    user.system_roles = roles;
    store.users.write(user);

    store.audit.append('USER_UPDATED', {
      user_principal_id: userId,
      previous_system_roles: previousRoles,
      new_system_roles: roles,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return { user_principal_id: userId, system_roles: roles };
  });

  // GET /v1/admin/audit
  app.get('/v1/admin/audit', { preHandler: adminAuth }, async (request) => {
    const query = request.query as { limit?: string; cursor?: string };
    const limit = query.limit ? Math.max(1, Math.min(parseInt(query.limit, 10) || 1, 1000)) : 50;
    const cursor = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;
    const data = store.audit.readPage(limit, cursor);
    const nextCursor = cursor + limit < data.total ? String(cursor + limit) : null;
    return { ...data, next_cursor: nextCursor };
  });

  // DELETE /v1/admin/agents/:agentPrincipalId
  app.delete('/v1/admin/agents/:agentPrincipalId', { preHandler: adminAuth }, async (request, reply) => {
    const { agentPrincipalId } = request.params as { agentPrincipalId: string };
    const state = store.state.getState();

    if (!state.agents.find((a) => a.agent_principal_id === agentPrincipalId)) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
      });
      return;
    }

    const summary = cascadeDeleteAgent(store, agentPrincipalId);

    store.audit.append('AGENT_DELETED', {
      agent_principal_id: agentPrincipalId,
      ...summary,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return { agent_principal_id: agentPrincipalId, status: 'deleted', ...summary };
  });

  // GET /v1/admin/users — list all users
  app.get('/v1/admin/users', { preHandler: adminAuth }, async () => {
    const state = store.state.getState();
    const users = state.users.map((entry) => {
      try {
        const user = store.users.read(entry.user_principal_id);
        return { ...user, system_roles: resolveSystemRoles(user) };
      } catch {
        return { user_principal_id: entry.user_principal_id, error: 'file_not_found' };
      }
    });
    return { users };
  });

  // GET /v1/admin/organizations — list all organizations
  app.get('/v1/admin/organizations', { preHandler: adminAuth }, async () => {
    const state = store.state.getState();
    const organizations = state.organizations.map((entry) => {
      try {
        return store.organizations.read(entry.org_id);
      } catch {
        return { org_id: entry.org_id, error: 'file_not_found' };
      }
    });
    return { organizations };
  });

  // GET /v1/admin/organizations/:orgId
  app.get('/v1/admin/organizations/:orgId', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const state = store.state.getState();
    const entry = state.organizations.find((o) => o.org_id === orgId);
    if (!entry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      return;
    }

    try {
      const org = store.organizations.read(orgId);
      const members = store.memberships.listByOrg(orgId).map((m) => {
        try {
          const user = store.users.read(m.user_principal_id);
          return { ...m, display_name: user.display_name };
        } catch {
          return { ...m, display_name: null };
        }
      });
      return { ...org, members };
    } catch {
      reply.code(404).send({ error: { code: 'FILE_NOT_FOUND', message: 'Organization file not found' } });
    }
  });

  // PUT /v1/admin/organizations/:orgId
  app.put('/v1/admin/organizations/:orgId', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const state = store.state.getState();
    if (!state.organizations.find((o) => o.org_id === orgId)) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      return;
    }

    const body = request.body as {
      display_name?: string;
      contact_identities?: ContactIdentity[];
      company_ids?: CompanyId[];
      domains?: OrgDomain[];
    };

    const org = store.organizations.read(orgId);
    const previousContactIds = new Set((org.contact_identities ?? []).map((c) => c.contact_id));
    if (body.display_name !== undefined) org.display_name = body.display_name.trim();
    if (body.contact_identities !== undefined) org.contact_identities = body.contact_identities;
    if (body.company_ids !== undefined) {
      org.company_ids = body.company_ids.map((cid) => {
        const result = validateCompanyIdValue(cid.id_type, cid.id_value, cid.country);
        return { ...cid, verification_level: result.valid ? 'FORMAT_VALID' as const : 'UNVERIFIED' as const };
      });
    }
    if (body.domains !== undefined) {
      org.domains = body.domains.map((d) => {
        const result = validateDomainName(d.domain);
        return {
          ...d,
          domain: d.domain.trim().toLowerCase(),
          verification_level: result.valid ? 'FORMAT_VALID' as const : 'UNVERIFIED' as const,
        };
      });
    }
    org.identity_assurance_level = computeOrgAssuranceLevel(org);
    store.organizations.write(org);

    store.audit.append('ORG_UPDATED', {
      org_id: orgId,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    // Emit verification request for newly added unverified contacts
    for (const contact of org.contact_identities ?? []) {
      if (!contact.verified && !previousContactIds.has(contact.contact_id)) {
        events.emit('contact_verification.requested', {
          contact_id: contact.contact_id,
          type: contact.type,
          value: contact.value,
          owner_type: 'org',
          owner_id: orgId,
          requested_by_user_id: getAdminSession(request)?.principal_id ?? '',
        });
      }
    }

    return { org_id: orgId, status: 'updated' };
  });

  // DELETE /v1/admin/organizations/:orgId
  app.delete('/v1/admin/organizations/:orgId', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const state = store.state.getState();
    if (!state.organizations.find((o) => o.org_id === orgId)) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      return;
    }

    const summary = cascadeDeleteOrg(store, orgId);

    store.audit.append('ORG_DELETED', {
      org_id: orgId,
      ...summary,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return { org_id: orgId, status: 'deleted', ...summary };
  });

  // GET /v1/admin/organizations/:orgId/members
  app.get('/v1/admin/organizations/:orgId/members', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const state = store.state.getState();
    if (!state.organizations.find((o) => o.org_id === orgId)) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      return;
    }

    const members = store.memberships.listByOrg(orgId).map((m) => {
      try {
        const user = store.users.read(m.user_principal_id);
        return { ...m, display_name: user.display_name };
      } catch {
        return { ...m, display_name: null };
      }
    });
    return { members };
  });

  // POST /v1/admin/organizations/:orgId/members
  app.post('/v1/admin/organizations/:orgId/members', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const body = request.body as { user_principal_id?: string; email?: string; role: string };

    const state = store.state.getState();
    if (!state.organizations.find((o) => o.org_id === orgId)) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      return;
    }

    if (!body.role) {
      reply.code(400).send({ error: { code: 'INVALID_BODY', message: 'role is required' } });
      return;
    }

    if (!body.user_principal_id && !body.email) {
      reply.code(400).send({ error: { code: 'INVALID_BODY', message: 'user_principal_id or email is required' } });
      return;
    }

    const { OrgRole } = await import('@openleash/core');
    const parsed = OrgRole.safeParse(body.role);
    if (!parsed.success) {
      reply.code(400).send({ error: { code: 'INVALID_ROLE', message: 'Invalid role. Valid: org_admin, org_member, org_viewer' } });
      return;
    }

    // Resolve user — by ID or by email lookup
    let targetUserId = body.user_principal_id;
    if (!targetUserId && body.email) {
      const emailLower = body.email.toLowerCase();
      for (const entry of state.users) {
        try {
          const user = store.users.read(entry.user_principal_id);
          const match = (user.contact_identities ?? []).find(
            (c) => c.type === 'EMAIL' && c.value.toLowerCase() === emailLower,
          );
          if (match) {
            targetUserId = entry.user_principal_id;
            break;
          }
        } catch {
          // skip
        }
      }
      if (!targetUserId) {
        reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'No user found with that email address' } });
        return;
      }
    }

    if (!state.users.find((u) => u.user_principal_id === targetUserId)) {
      reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'Target user not found' } });
      return;
    }

    const existing = store.memberships.listByOrg(orgId);
    if (existing.find((m) => m.user_principal_id === targetUserId)) {
      reply.code(409).send({ error: { code: 'ALREADY_MEMBER', message: 'User is already a member' } });
      return;
    }

    const membershipId = crypto.randomUUID();
    const now = new Date().toISOString();
    store.memberships.write({
      membership_id: membershipId,
      org_id: orgId,
      user_principal_id: targetUserId!,
      role: parsed.data,
      status: 'active',
      invited_by_user_id: null,
      created_at: now,
    });

    store.state.updateState((s) => {
      s.memberships.push({
        membership_id: membershipId,
        org_id: orgId,
        user_principal_id: targetUserId!,
        role: parsed.data,
        path: `./memberships/${membershipId}.json`,
      });
    });

    store.audit.append('ORG_MEMBER_ADDED', {
      org_id: orgId,
      user_principal_id: targetUserId!,
      role: parsed.data,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    const addedOrg = store.organizations.read(orgId);
    events.emit('org_member.added', {
      org_id: orgId,
      org_display_name: addedOrg.display_name,
      user_principal_id: targetUserId!,
      role: parsed.data,
      invited_by_user_id: getAdminSession(request)?.principal_id ?? null,
    });

    return { membership_id: membershipId, org_id: orgId, user_principal_id: targetUserId!, role: parsed.data };
  });

  // PUT /v1/admin/organizations/:orgId/members/:userId
  app.put('/v1/admin/organizations/:orgId/members/:userId', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string };
    const body = request.body as { role: string };

    const { OrgRole } = await import('@openleash/core');
    const parsed = OrgRole.safeParse(body.role);
    if (!parsed.success) {
      reply.code(400).send({ error: { code: 'INVALID_ROLE', message: 'Invalid role. Valid: org_admin, org_member, org_viewer' } });
      return;
    }

    const members = store.memberships.listByOrg(orgId);
    const target = members.find((m) => m.user_principal_id === userId);
    if (!target) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Membership not found' } });
      return;
    }

    const previousRole = target.role;
    target.role = parsed.data;
    store.memberships.write(target);
    store.state.updateState((s) => {
      const entry = s.memberships.find((m) => m.membership_id === target.membership_id);
      if (entry) entry.role = parsed.data;
    });

    store.audit.append('ORG_MEMBER_UPDATED', {
      org_id: orgId,
      user_principal_id: userId,
      previous_role: previousRole,
      new_role: parsed.data,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    return { membership_id: target.membership_id, role: parsed.data, status: 'updated' };
  });

  // DELETE /v1/admin/organizations/:orgId/members/:userId
  app.delete('/v1/admin/organizations/:orgId/members/:userId', { preHandler: adminAuth }, async (request, reply) => {
    const { orgId, userId } = request.params as { orgId: string; userId: string };

    const members = store.memberships.listByOrg(orgId);
    const target = members.find((m) => m.user_principal_id === userId);
    if (!target) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Membership not found' } });
      return;
    }

    store.memberships.delete(target.membership_id);
    store.state.updateState((s) => {
      const idx = s.memberships.findIndex((m) => m.membership_id === target.membership_id);
      if (idx !== -1) s.memberships.splice(idx, 1);
    });

    store.audit.append('ORG_MEMBER_REMOVED', {
      org_id: orgId,
      user_principal_id: userId,
    }, { principal_id: getAdminSession(request)?.principal_id ?? null });

    const removedOrg = store.organizations.read(orgId);
    events.emit('org_member.removed', {
      org_id: orgId,
      org_display_name: removedOrg.display_name,
      user_principal_id: userId,
      removed_by_user_id: getAdminSession(request)?.principal_id ?? null,
    });

    return { membership_id: target.membership_id, status: 'removed' };
  });

  // GET /v1/admin/agents — list all agents
  app.get('/v1/admin/agents', { preHandler: adminAuth }, async () => {
    const state = store.state.getState();
    const agents = state.agents.map((entry) => {
      try {
        return store.agents.read(entry.agent_principal_id);
      } catch {
        return { agent_principal_id: entry.agent_principal_id, agent_id: entry.agent_id, error: 'file_not_found' };
      }
    });
    return { agents };
  });

  // GET /v1/admin/policies — list all policies
  app.get('/v1/admin/policies', { preHandler: adminAuth }, async () => {
    const state = store.state.getState();
    const policies = state.policies.map((entry) => {
      try {
        const yaml = store.policies.read(entry.policy_id);
        return { ...entry, policy_yaml: yaml };
      } catch {
        return { ...entry, error: 'file_not_found' };
      }
    });
    return { policies };
  });

  // GET /v1/admin/policies/:policyId
  app.get('/v1/admin/policies/:policyId', { preHandler: adminAuth }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const state = store.state.getState();
    const entry = state.policies.find((p) => p.policy_id === policyId);
    if (!entry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      return;
    }
    try {
      const yaml = store.policies.read(policyId);
      return { ...entry, policy_yaml: yaml };
    } catch {
      reply.code(404).send({ error: { code: 'FILE_NOT_FOUND', message: 'Policy file not found' } });
    }
  });

  // GET /v1/admin/config
  app.get('/v1/admin/config', { preHandler: adminAuth }, async () => {
    return {
      server: config.server,
      admin: {
        mode: config.admin.mode,
        token_set: !!config.admin.token,
        allow_remote_admin: config.admin.allow_remote_admin,
      },
      security: config.security,
      tokens: config.tokens,
      gui: config.gui,
    };
  });

  // GET /v1/admin/state
  app.get('/v1/admin/state', { preHandler: adminAuth }, async () => {
    const state = store.state.getState();
    return {
      version: state.version,
      created_at: state.created_at,
      counts: {
        users: state.users.length,
        organizations: state.organizations.length,
        memberships: state.memberships.length,
        agents: state.agents.length,
        policies: state.policies.length,
        bindings: state.bindings.length,
        keys: state.server_keys.keys.length,
      },
      active_kid: state.server_keys.active_kid,
    };
  });
}
