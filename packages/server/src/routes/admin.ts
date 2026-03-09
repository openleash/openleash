import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  writeState,
  writeOwnerFile,
  readOwnerFile,
  readAgentFile,
  readPolicyFile,
  appendAuditEvent,
  readAuditLog,
  validateOwnerIdentity,
  validateGovernmentIdValue,
  validateCompanyIdValue,
  computeAssuranceLevel,
  writeSetupInviteFile,
  writeAgentInviteFile,
  hashPassphrase,
} from '@openleash/core';
import type {
  OpenleashConfig,
  OwnerFrontmatter,
  ContactIdentity,
  GovernmentId,
  CompanyId,
  Signatory,
  SignatoryRule,
} from '@openleash/core';
// Note: identity sub-types kept in imports for owner creation
import { createAdminAuth } from '../middleware/admin-auth.js';

export function registerAdminRoutes(app: FastifyInstance, dataDir: string, config: OpenleashConfig) {
  const adminAuth = createAdminAuth(config);

  // POST /v1/admin/owners
  app.post('/v1/admin/owners', { preHandler: adminAuth }, async (request, reply) => {
    const body = request.body as {
      principal_type: 'HUMAN' | 'ORG';
      display_name: string;
      attributes_json?: Record<string, unknown>;
      contact_identities?: ContactIdentity[];
      government_ids?: GovernmentId[];
      company_ids?: CompanyId[];
      signatories?: Signatory[];
      signatory_rules?: SignatoryRule[];
    };

    const ownerId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const now = createdAt;

    // Auto-assign UUIDs and timestamps to identity sub-objects
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

    const companyIds = (body.company_ids ?? []).map((c) => ({
      ...c,
      verification_level: c.verification_level || 'UNVERIFIED',
      verified_at: c.verified_at ?? null,
      added_at: c.added_at || now,
    }));

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

    // Auto-upgrade verification_level for gov IDs that pass format validation
    for (const g of govIds) {
      if (g.verification_level === 'UNVERIFIED') {
        const result = validateGovernmentIdValue(g.country, g.id_type, g.id_value);
        if (result.valid) g.verification_level = 'FORMAT_VALID';
      }
    }

    // Auto-upgrade verification_level for company IDs that pass format validation
    for (const c of companyIds) {
      if (c.verification_level === 'UNVERIFIED') {
        const result = validateCompanyIdValue(c.id_type, c.id_value, c.country);
        if (result.valid) c.verification_level = 'FORMAT_VALID';
      }
    }

    const owner: OwnerFrontmatter = {
      owner_principal_id: ownerId,
      principal_type: body.principal_type,
      display_name: body.display_name,
      status: 'ACTIVE',
      attributes: body.attributes_json ?? {},
      created_at: createdAt,
      ...(contacts.length > 0 && { contact_identities: contacts }),
      ...(govIds.length > 0 && { government_ids: govIds }),
      ...(companyIds.length > 0 && { company_ids: companyIds }),
      ...(signatories.length > 0 && { signatories }),
      ...(signatoryRules.length > 0 && { signatory_rules: signatoryRules }),
    };

    // Validate type constraints
    const validation = validateOwnerIdentity(owner);
    if (validation.type_errors.length > 0) {
      reply.code(400).send({
        error: { code: 'INVALID_IDENTITY', message: validation.type_errors.join('; ') },
      });
      return;
    }

    // Compute and set assurance level
    owner.identity_assurance_level = computeAssuranceLevel(owner);

    writeOwnerFile(dataDir, owner);

    const state = readState(dataDir);
    state.owners.push({
      owner_principal_id: ownerId,
      path: `./owners/${ownerId}.md`,
    });
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'OWNER_CREATED', {
      owner_principal_id: ownerId,
      display_name: body.display_name,
    });

    return {
      owner_principal_id: ownerId,
      principal_type: body.principal_type,
      display_name: body.display_name,
      status: 'ACTIVE',
      identity_assurance_level: owner.identity_assurance_level,
      created_at: createdAt,
    };
  });

  // ─── Setup invite ──────────────────────────────────────────────────

  // POST /v1/admin/owners/:ownerId/setup-invite
  app.post('/v1/admin/owners/:ownerId/setup-invite', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };

    // Verify owner exists
    const state = readState(dataDir);
    const ownerEntry = state.owners.find((o) => o.owner_principal_id === ownerId);
    if (!ownerEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Owner not found' },
      });
      return;
    }

    // Generate random invite token
    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

    writeSetupInviteFile(dataDir, {
      invite_id: inviteId,
      owner_principal_id: ownerId,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    appendAuditEvent(dataDir, 'OWNER_SETUP_INVITE_CREATED', {
      owner_principal_id: ownerId,
      invite_id: inviteId,
    });

    return {
      invite_id: inviteId,
      invite_token: inviteToken,
      expires_at: expiresAt,
    };
  });

  // POST /v1/admin/owners/:ownerId/agent-invite
  app.post('/v1/admin/owners/:ownerId/agent-invite', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };

    const state = readState(dataDir);
    const ownerEntry = state.owners.find((o) => o.owner_principal_id === ownerId);
    if (!ownerEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Owner not found' },
      });
      return;
    }

    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    writeAgentInviteFile(dataDir, {
      invite_id: inviteId,
      owner_principal_id: ownerId,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    appendAuditEvent(dataDir, 'AGENT_INVITE_CREATED', {
      owner_principal_id: ownerId,
      invite_id: inviteId,
    });

    return {
      invite_id: inviteId,
      invite_token: inviteToken,
      expires_at: expiresAt,
    };
  });

  // DELETE /v1/admin/owners/:ownerId
  app.delete('/v1/admin/owners/:ownerId', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const state = readState(dataDir);
    const ownerIndex = state.owners.findIndex((o) => o.owner_principal_id === ownerId);

    if (ownerIndex === -1) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Owner not found' },
      });
      return;
    }

    // Remove from state
    state.owners.splice(ownerIndex, 1);
    writeState(dataDir, state);

    // Delete owner file
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.join(dataDir, 'owners', `${ownerId}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return { owner_principal_id: ownerId, status: 'deleted' };
  });

  // POST /v1/admin/owners/:ownerId/disable-totp
  app.post('/v1/admin/owners/:ownerId/disable-totp', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };

    const state = readState(dataDir);
    const ownerEntry = state.owners.find((o) => o.owner_principal_id === ownerId);
    if (!ownerEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Owner not found' },
      });
      return;
    }

    const owner = readOwnerFile(dataDir, ownerId);
    if (!owner.totp_enabled) {
      reply.code(400).send({
        error: { code: 'TOTP_NOT_ENABLED', message: 'TOTP is not enabled for this owner' },
      });
      return;
    }

    delete owner.totp_secret_b32;
    delete owner.totp_enabled;
    delete owner.totp_enabled_at;
    delete owner.totp_backup_codes_hash;
    writeOwnerFile(dataDir, owner);

    appendAuditEvent(dataDir, 'OWNER_TOTP_DISABLED', {
      owner_principal_id: ownerId,
      disabled_by: 'admin',
    });

    return { owner_principal_id: ownerId, status: 'totp_disabled' };
  });

  // GET /v1/admin/audit
  app.get('/v1/admin/audit', { preHandler: adminAuth }, async (request) => {
    const query = request.query as { limit?: string; cursor?: string };
    const limit = query.limit ? Math.max(1, Math.min(parseInt(query.limit, 10) || 1, 1000)) : 50;
    const cursor = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;
    return readAuditLog(dataDir, limit, cursor);
  });

  // GET /v1/admin/owners — list all owners with details
  app.get('/v1/admin/owners', { preHandler: adminAuth }, async () => {
    const state = readState(dataDir);
    const owners = state.owners.map((entry) => {
      try {
        return readOwnerFile(dataDir, entry.owner_principal_id);
      } catch {
        return { owner_principal_id: entry.owner_principal_id, error: 'file_not_found' };
      }
    });
    return { owners };
  });

  // GET /v1/admin/agents — list all agents with details
  app.get('/v1/admin/agents', { preHandler: adminAuth }, async () => {
    const state = readState(dataDir);
    const agents = state.agents.map((entry) => {
      try {
        return readAgentFile(dataDir, entry.agent_principal_id);
      } catch {
        return { agent_principal_id: entry.agent_principal_id, agent_id: entry.agent_id, error: 'file_not_found' };
      }
    });
    return { agents };
  });

  // GET /v1/admin/policies — list all policies with YAML content
  app.get('/v1/admin/policies', { preHandler: adminAuth }, async () => {
    const state = readState(dataDir);
    const policies = state.policies.map((entry) => {
      try {
        const yaml = readPolicyFile(dataDir, entry.policy_id);
        return { ...entry, policy_yaml: yaml };
      } catch {
        return { ...entry, error: 'file_not_found' };
      }
    });
    return { policies };
  });

  // GET /v1/admin/policies/:policyId — get single policy
  app.get('/v1/admin/policies/:policyId', { preHandler: adminAuth }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const state = readState(dataDir);
    const entry = state.policies.find((p) => p.policy_id === policyId);
    if (!entry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      return;
    }
    try {
      const yaml = readPolicyFile(dataDir, policyId);
      return { ...entry, policy_yaml: yaml };
    } catch {
      reply.code(404).send({ error: { code: 'FILE_NOT_FOUND', message: 'Policy file not found' } });
    }
  });

  // GET /v1/admin/config — return sanitized config
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

  // GET /v1/admin/state — return state summary
  app.get('/v1/admin/state', { preHandler: adminAuth }, async () => {
    const state = readState(dataDir);
    return {
      version: state.version,
      created_at: state.created_at,
      counts: {
        owners: state.owners.length,
        agents: state.agents.length,
        policies: state.policies.length,
        bindings: state.bindings.length,
        keys: state.server_keys.keys.length,
      },
      active_kid: state.server_keys.active_kid,
    };
  });
}
