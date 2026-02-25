import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  writeState,
  writeOwnerFile,
  readOwnerFile,
  readAgentFile,
  readPolicyFile,
  writePolicyFile,
  deletePolicyFile,
  parsePolicyYaml,
  appendAuditEvent,
  readAuditLog,
  validateOwnerIdentity,
  validateGovernmentIdValue,
  validateCompanyIdValue,
  computeAssuranceLevel,
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

  // ─── Identity sub-resource routes ──────────────────────────────────

  /** Helper: read owner, apply transform, validate, write back, audit. */
  function updateOwnerIdentity(
    dataDir: string,
    ownerId: string,
    transform: (owner: OwnerFrontmatter) => void,
    auditDetails: Record<string, unknown>,
  ): OwnerFrontmatter {
    const owner = readOwnerFile(dataDir, ownerId);
    transform(owner);
    const validation = validateOwnerIdentity(owner);
    if (validation.type_errors.length > 0) {
      throw new IdentityValidationError(validation.type_errors.join('; '));
    }
    owner.identity_assurance_level = computeAssuranceLevel(owner);
    writeOwnerFile(dataDir, owner);
    appendAuditEvent(dataDir, 'OWNER_IDENTITY_UPDATED', {
      owner_principal_id: ownerId,
      ...auditDetails,
    });
    return owner;
  }

  class IdentityValidationError extends Error {
    constructor(message: string) { super(message); this.name = 'IdentityValidationError'; }
  }

  // PUT /v1/admin/owners/:ownerId/contact-identities — replace all
  app.put('/v1/admin/owners/:ownerId/contact-identities', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const body = request.body as { contact_identities: ContactIdentity[] };
    try {
      const before = readOwnerFile(dataDir, ownerId);
      const beforeCount = before.contact_identities?.length ?? 0;
      const owner = updateOwnerIdentity(dataDir, ownerId, (o) => {
        o.contact_identities = body.contact_identities.map((c) => ({
          ...c,
          contact_id: c.contact_id || crypto.randomUUID(),
          verified: c.verified ?? false,
          verified_at: c.verified_at ?? null,
          added_at: c.added_at || new Date().toISOString(),
        }));
      }, {
        field: 'contact_identities',
        action: 'replaced',
        before_count: beforeCount,
        after_count: body.contact_identities.length,
      });
      return { owner_principal_id: ownerId, contact_identities: owner.contact_identities };
    } catch (e) {
      if (e instanceof IdentityValidationError) {
        reply.code(400).send({ error: { code: 'INVALID_IDENTITY', message: e.message } });
        return;
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
  });

  // POST /v1/admin/owners/:ownerId/contact-identities — add one
  app.post('/v1/admin/owners/:ownerId/contact-identities', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const contact = request.body as ContactIdentity;
    try {
      const owner = updateOwnerIdentity(dataDir, ownerId, (o) => {
        const entry = {
          ...contact,
          contact_id: contact.contact_id || crypto.randomUUID(),
          verified: contact.verified ?? false,
          verified_at: contact.verified_at ?? null,
          added_at: contact.added_at || new Date().toISOString(),
        };
        o.contact_identities = [...(o.contact_identities ?? []), entry];
      }, {
        field: 'contact_identities',
        action: 'added',
        contact_type: contact.type,
        contact_value: contact.value,
      });
      return { owner_principal_id: ownerId, contact_identities: owner.contact_identities };
    } catch (e) {
      if (e instanceof IdentityValidationError) {
        reply.code(400).send({ error: { code: 'INVALID_IDENTITY', message: e.message } });
        return;
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
  });

  // PUT /v1/admin/owners/:ownerId/government-ids — replace all (HUMAN only)
  app.put('/v1/admin/owners/:ownerId/government-ids', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const body = request.body as { government_ids: GovernmentId[] };
    try {
      const before = readOwnerFile(dataDir, ownerId);
      const beforeCountries = new Set((before.government_ids ?? []).map((g) => g.country));
      const afterCountries = new Set(body.government_ids.map((g) => g.country));
      const added = [...afterCountries].filter((c) => !beforeCountries.has(c));
      const removed = [...beforeCountries].filter((c) => !afterCountries.has(c));
      const owner = updateOwnerIdentity(dataDir, ownerId, (o) => {
        o.government_ids = body.government_ids.map((g) => {
          const entry = {
            ...g,
            verification_level: g.verification_level || 'UNVERIFIED' as const,
            verified_at: g.verified_at ?? null,
            added_at: g.added_at || new Date().toISOString(),
          };
          if (entry.verification_level === 'UNVERIFIED') {
            const result = validateGovernmentIdValue(g.country, g.id_type, g.id_value);
            if (result.valid) entry.verification_level = 'FORMAT_VALID';
          }
          return entry;
        });
      }, {
        field: 'government_ids',
        action: added.length > 0 && removed.length > 0 ? 'replaced' : added.length > 0 ? 'added' : 'removed',
        before_count: before.government_ids?.length ?? 0,
        after_count: body.government_ids.length,
        ...(added.length > 0 && { added_countries: added }),
        ...(removed.length > 0 && { removed_countries: removed }),
      });
      return { owner_principal_id: ownerId, government_ids: owner.government_ids };
    } catch (e) {
      if (e instanceof IdentityValidationError) {
        reply.code(400).send({ error: { code: 'INVALID_IDENTITY', message: e.message } });
        return;
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
  });

  // PUT /v1/admin/owners/:ownerId/company-ids — replace all (ORG only)
  app.put('/v1/admin/owners/:ownerId/company-ids', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const body = request.body as { company_ids: CompanyId[] };
    try {
      const before = readOwnerFile(dataDir, ownerId);
      const beforeTypes = new Set((before.company_ids ?? []).map((c) => c.id_type));
      const afterTypes = new Set(body.company_ids.map((c) => c.id_type));
      const added = [...afterTypes].filter((t) => !beforeTypes.has(t));
      const removed = [...beforeTypes].filter((t) => !afterTypes.has(t));
      const owner = updateOwnerIdentity(dataDir, ownerId, (o) => {
        o.company_ids = body.company_ids.map((c) => {
          const entry = {
            ...c,
            verification_level: c.verification_level || 'UNVERIFIED' as const,
            verified_at: c.verified_at ?? null,
            added_at: c.added_at || new Date().toISOString(),
          };
          if (entry.verification_level === 'UNVERIFIED') {
            const result = validateCompanyIdValue(c.id_type, c.id_value, c.country);
            if (result.valid) entry.verification_level = 'FORMAT_VALID';
          }
          return entry;
        });
      }, {
        field: 'company_ids',
        action: added.length > 0 && removed.length > 0 ? 'replaced' : added.length > 0 ? 'added' : 'removed',
        before_count: before.company_ids?.length ?? 0,
        after_count: body.company_ids.length,
        ...(added.length > 0 && { added_types: added }),
        ...(removed.length > 0 && { removed_types: removed }),
      });
      return { owner_principal_id: ownerId, company_ids: owner.company_ids };
    } catch (e) {
      if (e instanceof IdentityValidationError) {
        reply.code(400).send({ error: { code: 'INVALID_IDENTITY', message: e.message } });
        return;
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
  });

  // PUT /v1/admin/owners/:ownerId/signatories — replace all (ORG only)
  app.put('/v1/admin/owners/:ownerId/signatories', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const body = request.body as { signatories: Signatory[] };
    try {
      const before = readOwnerFile(dataDir, ownerId);
      const beforeIds = new Set((before.signatories ?? []).map((s) => s.human_owner_principal_id));
      const afterIds = new Set(body.signatories.map((s) => s.human_owner_principal_id));
      const added = [...afterIds].filter((id) => !beforeIds.has(id));
      const removed = [...beforeIds].filter((id) => !afterIds.has(id));
      const owner = updateOwnerIdentity(dataDir, ownerId, (o) => {
        o.signatories = body.signatories.map((s) => ({
          ...s,
          signatory_id: s.signatory_id || crypto.randomUUID(),
          valid_until: s.valid_until ?? null,
          added_at: s.added_at || new Date().toISOString(),
        }));
      }, {
        field: 'signatories',
        action: added.length > 0 && removed.length > 0 ? 'replaced' : added.length > 0 ? 'added' : 'removed',
        before_count: before.signatories?.length ?? 0,
        after_count: body.signatories.length,
        ...(added.length > 0 && { added_human_ids: added }),
        ...(removed.length > 0 && { removed_human_ids: removed }),
      });
      return { owner_principal_id: ownerId, signatories: owner.signatories };
    } catch (e) {
      if (e instanceof IdentityValidationError) {
        reply.code(400).send({ error: { code: 'INVALID_IDENTITY', message: e.message } });
        return;
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
  });

  // PUT /v1/admin/owners/:ownerId/signatory-rules — replace all (ORG only)
  app.put('/v1/admin/owners/:ownerId/signatory-rules', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const body = request.body as { signatory_rules: SignatoryRule[] };
    try {
      const before = readOwnerFile(dataDir, ownerId);
      const beforeCount = before.signatory_rules?.length ?? 0;
      const owner = updateOwnerIdentity(dataDir, ownerId, (o) => {
        o.signatory_rules = body.signatory_rules.map((r) => ({
          ...r,
          rule_id: r.rule_id || crypto.randomUUID(),
        }));
      }, {
        field: 'signatory_rules',
        action: body.signatory_rules.length > beforeCount ? 'added' : body.signatory_rules.length < beforeCount ? 'removed' : 'replaced',
        before_count: beforeCount,
        after_count: body.signatory_rules.length,
      });
      return { owner_principal_id: ownerId, signatory_rules: owner.signatory_rules };
    } catch (e) {
      if (e instanceof IdentityValidationError) {
        reply.code(400).send({ error: { code: 'INVALID_IDENTITY', message: e.message } });
        return;
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Owner not found' } });
    }
  });

  // POST /v1/admin/validate/government-id — dry-run validation
  app.post('/v1/admin/validate/government-id', { preHandler: adminAuth }, async (request) => {
    const body = request.body as { country: string; id_type: string; id_value: string };
    const result = validateGovernmentIdValue(body.country as 'SE', body.id_type, body.id_value);
    return { ...result, country: body.country, id_type: body.id_type };
  });

  // POST /v1/admin/validate/company-id — dry-run validation
  app.post('/v1/admin/validate/company-id', { preHandler: adminAuth }, async (request) => {
    const body = request.body as { id_type: string; id_value: string; country?: string };
    const result = validateCompanyIdValue(body.id_type as 'VAT', body.id_value, body.country as 'SE' | undefined);
    return { ...result, id_type: body.id_type };
  });

  // POST /v1/admin/policies
  app.post('/v1/admin/policies', { preHandler: adminAuth }, async (request, reply) => {
    const body = request.body as {
      owner_principal_id: string;
      applies_to_agent_principal_id?: string | null;
      policy_yaml: string;
    };

    // Validate policy
    try {
      parsePolicyYaml(body.policy_yaml);
    } catch (e: unknown) {
      reply.code(400).send({
        error: { code: 'INVALID_POLICY', message: (e as Error).message },
      });
      return;
    }

    const policyId = crypto.randomUUID();
    writePolicyFile(dataDir, policyId, body.policy_yaml);

    const state = readState(dataDir);
    const appliesToAgent = body.applies_to_agent_principal_id ?? null;

    state.policies.push({
      policy_id: policyId,
      owner_principal_id: body.owner_principal_id,
      applies_to_agent_principal_id: appliesToAgent,
      path: `./policies/${policyId}.yaml`,
    });

    state.bindings.push({
      owner_principal_id: body.owner_principal_id,
      policy_id: policyId,
      applies_to_agent_principal_id: appliesToAgent,
    });

    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_UPSERTED', {
      policy_id: policyId,
      owner_principal_id: body.owner_principal_id,
    });

    return {
      policy_id: policyId,
      owner_principal_id: body.owner_principal_id,
      applies_to_agent_principal_id: appliesToAgent,
      path: `./policies/${policyId}.yaml`,
    };
  });

  // DELETE /v1/admin/policies/:policyId
  app.delete('/v1/admin/policies/:policyId', { preHandler: adminAuth }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const state = readState(dataDir);
    const policyIndex = state.policies.findIndex((p) => p.policy_id === policyId);

    if (policyIndex === -1) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      return;
    }

    // Remove policy file from disk
    deletePolicyFile(dataDir, policyId);

    // Remove from state.policies
    state.policies.splice(policyIndex, 1);

    // Remove all bindings referencing this policy
    state.bindings = state.bindings.filter((b) => b.policy_id !== policyId);

    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_DELETED', { policy_id: policyId });

    return { policy_id: policyId, status: 'deleted' };
  });

  // POST /v1/admin/policies/:policyId/unbind
  app.post('/v1/admin/policies/:policyId/unbind', { preHandler: adminAuth }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const body = request.body as { owner_principal_id?: string } | null;

    const state = readState(dataDir);
    const entry = state.policies.find((p) => p.policy_id === policyId);
    if (!entry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      return;
    }

    const before = state.bindings.length;
    const ownerId = body?.owner_principal_id;

    if (ownerId) {
      state.bindings = state.bindings.filter(
        (b) => !(b.policy_id === policyId && b.owner_principal_id === ownerId)
      );
    } else {
      state.bindings = state.bindings.filter((b) => b.policy_id !== policyId);
    }

    const removed = before - state.bindings.length;
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_UNBOUND', {
      policy_id: policyId,
      owner_principal_id: ownerId ?? null,
      bindings_removed: removed,
    });

    return { policy_id: policyId, bindings_removed: removed };
  });

  // GET /v1/admin/audit
  app.get('/v1/admin/audit', { preHandler: adminAuth }, async (request) => {
    const query = request.query as { limit?: string; cursor?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const cursor = query.cursor ? parseInt(query.cursor, 10) : 0;
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

  // PUT /v1/admin/policies/:policyId — update policy YAML
  app.put('/v1/admin/policies/:policyId', { preHandler: adminAuth }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const body = request.body as { policy_yaml: string };

    const state = readState(dataDir);
    const entry = state.policies.find((p) => p.policy_id === policyId);
    if (!entry) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      return;
    }

    try {
      parsePolicyYaml(body.policy_yaml);
    } catch (e: unknown) {
      reply.code(400).send({
        error: { code: 'INVALID_POLICY', message: (e as Error).message },
      });
      return;
    }

    writePolicyFile(dataDir, policyId, body.policy_yaml);

    appendAuditEvent(dataDir, 'POLICY_UPDATED', {
      policy_id: policyId,
      owner_principal_id: entry.owner_principal_id,
    });

    return { policy_id: policyId, status: 'updated' };
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
