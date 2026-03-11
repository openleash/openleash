import * as crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  readState,
  writeState,
  readOwnerFile,
  writeOwnerFile,
  readAgentFile,
  writeAgentFile,
  readPolicyFile,
  writePolicyFile,
  deletePolicyFile,
  readKeyFile,
  readApprovalRequestFile,
  writeApprovalRequestFile,
  readPolicyDraftFile,
  writePolicyDraftFile,
  readSetupInviteFile,
  writeSetupInviteFile,
  writeAgentInviteFile,
  parsePolicyYaml,
  appendAuditEvent,
  readAuditLog,
  issueSessionToken,
  issueApprovalToken,
  hashPassphrase,
  verifyPassphrase,
  validateOwnerIdentity,
  computeAssuranceLevel,
  generateTotpSecret,
  generateTotpUri,
  generateTotpQrSvg,
  verifyTotp,
  generateBackupCodes,
  verifyBackupCode,
} from '@openleash/core';
import type {
  OpenleashConfig,
  SessionClaims,
  ContactIdentity,
  GovernmentId,
  CompanyId,
  Signatory,
  SignatoryRule,
} from '@openleash/core';
import { createOwnerAuth } from '../middleware/owner-auth.js';

export function registerOwnerRoutes(
  app: FastifyInstance,
  dataDir: string,
  config: OpenleashConfig
) {
  const ownerAuth = createOwnerAuth(config, dataDir);

  // ─── No-auth routes ───────────────────────────────────────────────

  // POST /v1/initial-setup — first-time setup: create the first owner
  app.post('/v1/initial-setup', async (request, reply) => {
    const body = request.body as {
      display_name: string;
      principal_type: string;
      passphrase: string;
    };

    if (!body.display_name || !body.passphrase) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'display_name and passphrase are required' },
      });
      return;
    }

    if (body.passphrase.length < 8) {
      reply.code(400).send({
        error: { code: 'WEAK_PASSPHRASE', message: 'Passphrase must be at least 8 characters' },
      });
      return;
    }

    const principalType = body.principal_type === 'ORG' ? 'ORG' : 'HUMAN';

    // Guard: only allowed when no owners exist
    const state = readState(dataDir);
    if (state.owners.length > 0) {
      reply.code(403).send({
        error: { code: 'SETUP_ALREADY_COMPLETED', message: 'Initial setup has already been completed' },
      });
      return;
    }

    // Create the first owner
    const ownerId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(body.passphrase);

    writeOwnerFile(dataDir, {
      owner_principal_id: ownerId,
      principal_type: principalType as 'HUMAN' | 'ORG',
      display_name: body.display_name,
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
      passphrase_hash: hash,
      passphrase_salt: salt,
      passphrase_set_at: new Date().toISOString(),
    });

    // Update state
    state.owners.push({
      owner_principal_id: ownerId,
      path: `./owners/${ownerId}.md`,
    });
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'INITIAL_SETUP_COMPLETED', {
      owner_principal_id: ownerId,
      display_name: body.display_name,
    });

    return {
      status: 'setup_complete',
      owner_principal_id: ownerId,
      display_name: body.display_name,
    };
  });

  // POST /v1/owner/setup — complete setup with invite token + passphrase
  app.post('/v1/owner/setup', async (request, reply) => {
    const body = request.body as {
      invite_id: string;
      invite_token: string;
      passphrase: string;
    };

    if (!body.invite_id || !body.invite_token || !body.passphrase) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'invite_id, invite_token, and passphrase are required' },
      });
      return;
    }

    if (body.passphrase.length < 8) {
      reply.code(400).send({
        error: { code: 'WEAK_PASSPHRASE', message: 'Passphrase must be at least 8 characters' },
      });
      return;
    }

    // Load invite
    let invite;
    try {
      invite = readSetupInviteFile(dataDir, body.invite_id);
    } catch {
      reply.code(404).send({
        error: { code: 'INVITE_NOT_FOUND', message: 'Setup invite not found' },
      });
      return;
    }

    // Check already used
    if (invite.used) {
      reply.code(400).send({
        error: { code: 'INVITE_USED', message: 'Setup invite has already been used' },
      });
      return;
    }

    // Check expiry
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      reply.code(400).send({
        error: { code: 'INVITE_EXPIRED', message: 'Setup invite has expired' },
      });
      return;
    }

    // Verify invite token hash
    const { hash: computedHash } = hashPassphrase(body.invite_token, invite.token_salt);
    if (computedHash !== invite.token_hash) {
      reply.code(401).send({
        error: { code: 'INVALID_INVITE_TOKEN', message: 'Invalid invite token' },
      });
      return;
    }

    // Hash passphrase and store on owner
    const { hash, salt } = hashPassphrase(body.passphrase);

    const owner = readOwnerFile(dataDir, invite.owner_principal_id);
    owner.passphrase_hash = hash;
    owner.passphrase_salt = salt;
    owner.passphrase_set_at = new Date().toISOString();
    writeOwnerFile(dataDir, owner);

    // Mark invite as used
    invite.used = true;
    invite.used_at = new Date().toISOString();
    writeSetupInviteFile(dataDir, invite);

    appendAuditEvent(dataDir, 'OWNER_SETUP_COMPLETED', {
      owner_principal_id: invite.owner_principal_id,
    });

    return {
      status: 'setup_complete',
      owner_principal_id: invite.owner_principal_id,
    };
  });

  // POST /v1/owner/login
  app.post('/v1/owner/login', async (request, reply) => {
    const body = request.body as {
      owner_principal_id: string;
      passphrase: string;
    };

    if (!body.owner_principal_id || !body.passphrase) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'owner_principal_id and passphrase are required' },
      });
      return;
    }

    // Look up owner
    const state = readState(dataDir);
    const ownerEntry = state.owners.find((o) => o.owner_principal_id === body.owner_principal_id);
    if (!ownerEntry) {
      reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
      return;
    }

    let owner;
    try {
      owner = readOwnerFile(dataDir, body.owner_principal_id);
    } catch {
      reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
      return;
    }

    if (owner.status !== 'ACTIVE') {
      reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
      return;
    }

    if (!owner.passphrase_hash || !owner.passphrase_salt) {
      reply.code(401).send({
        error: { code: 'SETUP_REQUIRED', message: 'Owner has not completed setup' },
      });
      return;
    }

    // Verify passphrase
    if (!verifyPassphrase(body.passphrase, owner.passphrase_hash, owner.passphrase_salt)) {
      reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
      return;
    }

    // Issue session token
    const activeKey = readKeyFile(dataDir, state.server_keys.active_kid);
    const ttl = config.sessions?.ttl_seconds ?? 28800;
    const session = await issueSessionToken({
      key: activeKey,
      ownerPrincipalId: body.owner_principal_id,
      ttlSeconds: ttl,
    });

    appendAuditEvent(dataDir, 'OWNER_LOGIN', {
      owner_principal_id: body.owner_principal_id,
      display_name: owner.display_name,
    });

    return {
      token: session.token,
      expires_at: session.expiresAt,
      owner_principal_id: body.owner_principal_id,
    };
  });

  // POST /v1/owner/logout
  app.post('/v1/owner/logout', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;

    appendAuditEvent(dataDir, 'OWNER_LOGOUT', {
      owner_principal_id: session.sub,
    });

    return { status: 'logged_out' };
  });

  // ─── Owner-authed routes ──────────────────────────────────────────

  // GET /v1/owner/profile
  app.get('/v1/owner/profile', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const owner = readOwnerFile(dataDir, session.sub);

    // Strip sensitive fields
    const { passphrase_hash: _hash, passphrase_salt: _salt, totp_secret_b32: _secret, totp_backup_codes_hash: _codes, ...safeOwner } = owner;
    return { ...safeOwner, totp_enabled: !!owner.totp_enabled };
  });

  // PUT /v1/owner/profile
  app.put('/v1/owner/profile', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const body = request.body as {
      display_name?: string;
      contact_identities?: ContactIdentity[];
      government_ids?: GovernmentId[];
      company_ids?: CompanyId[];
      signatories?: Signatory[];
      signatory_rules?: SignatoryRule[];
    };

    const owner = readOwnerFile(dataDir, session.sub);

    if (body.display_name !== undefined) owner.display_name = body.display_name;
    if (body.contact_identities !== undefined) {
      owner.contact_identities = body.contact_identities.map((c) => ({
        ...c,
        contact_id: c.contact_id || crypto.randomUUID(),
        verified: c.verified ?? false,
        verified_at: c.verified_at ?? null,
        added_at: c.added_at || new Date().toISOString(),
      }));
    }
    if (body.government_ids !== undefined) owner.government_ids = body.government_ids;
    if (body.company_ids !== undefined) owner.company_ids = body.company_ids;
    if (body.signatories !== undefined) {
      owner.signatories = body.signatories.map((s) => ({
        ...s,
        signatory_id: s.signatory_id || crypto.randomUUID(),
        valid_until: s.valid_until ?? null,
        added_at: s.added_at || new Date().toISOString(),
      }));
    }
    if (body.signatory_rules !== undefined) {
      owner.signatory_rules = body.signatory_rules.map((r) => ({
        ...r,
        rule_id: r.rule_id || crypto.randomUUID(),
      }));
    }

    const validation = validateOwnerIdentity(owner);
    if (validation.type_errors.length > 0) {
      reply.code(400).send({
        error: { code: 'INVALID_IDENTITY', message: validation.type_errors.join('; ') },
      });
      return;
    }

    owner.identity_assurance_level = computeAssuranceLevel(owner);
    writeOwnerFile(dataDir, owner);

    appendAuditEvent(dataDir, 'OWNER_UPDATED', {
      owner_principal_id: session.sub,
    });

    const { passphrase_hash: _hash, passphrase_salt: _salt, ...safeOwner } = owner;
    return safeOwner;
  });

  // ─── Agents (scoped to owner) ─────────────────────────────────────

  // GET /v1/owner/agents
  app.get('/v1/owner/agents', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const state = readState(dataDir);
    const agents = state.agents
      .filter((a) => a.owner_principal_id === session.sub)
      .map((entry) => {
        try {
          return readAgentFile(dataDir, entry.agent_principal_id);
        } catch {
          return { agent_principal_id: entry.agent_principal_id, agent_id: entry.agent_id, error: 'file_not_found' };
        }
      });
    return { agents };
  });

  // PUT /v1/owner/agents/:agentId
  app.put('/v1/owner/agents/:agentId', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { agentId } = request.params as { agentId: string };
    const body = request.body as { status: 'ACTIVE' | 'REVOKED' };

    const state = readState(dataDir);
    const agentEntry = state.agents.find(
      (a) => a.agent_principal_id === agentId && a.owner_principal_id === session.sub
    );

    if (!agentEntry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
      });
      return;
    }

    const agent = readAgentFile(dataDir, agentEntry.agent_principal_id);
    agent.status = body.status;
    if (body.status === 'REVOKED') {
      agent.revoked_at = new Date().toISOString();
    }
    writeAgentFile(dataDir, agent);

    return {
      agent_principal_id: agentEntry.agent_principal_id,
      agent_id: agent.agent_id,
      status: agent.status,
    };
  });

  // POST /v1/owner/agent-invites
  app.post('/v1/owner/agent-invites', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;

    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    writeAgentInviteFile(dataDir, {
      invite_id: inviteId,
      owner_principal_id: session.sub,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    appendAuditEvent(dataDir, 'AGENT_INVITE_CREATED', {
      owner_principal_id: session.sub,
      invite_id: inviteId,
    });

    return {
      invite_id: inviteId,
      invite_token: inviteToken,
      expires_at: expiresAt,
    };
  });

  // ─── Policies (scoped to owner) ──────────────────────────────────

  // GET /v1/owner/policies
  app.get('/v1/owner/policies', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const state = readState(dataDir);
    const policies = state.policies
      .filter((p) => p.owner_principal_id === session.sub)
      .map((entry) => {
        try {
          const yaml = readPolicyFile(dataDir, entry.policy_id);
          return { ...entry, policy_yaml: yaml };
        } catch {
          return { ...entry, error: 'file_not_found' };
        }
      });
    return { policies };
  });

  // POST /v1/owner/policies
  app.post('/v1/owner/policies', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const body = request.body as {
      applies_to_agent_principal_id?: string | null;
      policy_yaml: string;
      name?: string;
      description?: string;
    };

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
    const policyName = body.name?.trim() || null;
    const policyDescription = body.description?.trim() || null;

    state.policies.push({
      policy_id: policyId,
      owner_principal_id: session.sub,
      applies_to_agent_principal_id: appliesToAgent,
      name: policyName,
      description: policyDescription,
      path: `./policies/${policyId}.yaml`,
    });

    state.bindings.push({
      owner_principal_id: session.sub,
      policy_id: policyId,
      applies_to_agent_principal_id: appliesToAgent,
    });

    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_UPSERTED', {
      policy_id: policyId,
      owner_principal_id: session.sub,
      applies_to_agent_principal_id: appliesToAgent,
    });

    return {
      policy_id: policyId,
      owner_principal_id: session.sub,
      applies_to_agent_principal_id: appliesToAgent,
    };
  });

  // GET /v1/owner/policies/:policyId
  app.get('/v1/owner/policies/:policyId', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { policyId } = request.params as { policyId: string };

    const state = readState(dataDir);
    const entry = state.policies.find(
      (p) => p.policy_id === policyId && p.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy not found' },
      });
      return;
    }

    try {
      const yaml = readPolicyFile(dataDir, policyId);
      return { ...entry, policy_yaml: yaml };
    } catch {
      reply.code(404).send({
        error: { code: 'FILE_NOT_FOUND', message: 'Policy file not found' },
      });
    }
  });

  // PUT /v1/owner/policies/:policyId
  app.put('/v1/owner/policies/:policyId', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { policyId } = request.params as { policyId: string };
    const body = request.body as { policy_yaml?: string; name?: string | null; description?: string | null };

    const state = readState(dataDir);
    const entry = state.policies.find(
      (p) => p.policy_id === policyId && p.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy not found' },
      });
      return;
    }

    if (body.policy_yaml !== undefined) {
      try {
        parsePolicyYaml(body.policy_yaml);
      } catch (e: unknown) {
        reply.code(400).send({
          error: { code: 'INVALID_POLICY', message: (e as Error).message },
        });
        return;
      }
      writePolicyFile(dataDir, policyId, body.policy_yaml);
    }

    let stateChanged = false;
    if (body.name !== undefined) {
      entry.name = body.name?.trim() || null;
      stateChanged = true;
    }
    if (body.description !== undefined) {
      entry.description = body.description?.trim() || null;
      stateChanged = true;
    }
    if (stateChanged) {
      writeState(dataDir, state);
    }

    appendAuditEvent(dataDir, 'POLICY_UPDATED', {
      policy_id: policyId,
      owner_principal_id: session.sub,
    });

    return { policy_id: policyId, status: 'updated' };
  });

  // DELETE /v1/owner/policies/:policyId
  app.delete('/v1/owner/policies/:policyId', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { policyId } = request.params as { policyId: string };

    const state = readState(dataDir);
    const policyIndex = state.policies.findIndex(
      (p) => p.policy_id === policyId && p.owner_principal_id === session.sub
    );

    if (policyIndex === -1) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy not found' },
      });
      return;
    }

    deletePolicyFile(dataDir, policyId);
    state.policies.splice(policyIndex, 1);
    state.bindings = state.bindings.filter((b) => b.policy_id !== policyId);
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_DELETED', {
      policy_id: policyId,
      owner_principal_id: session.sub,
    });

    return { policy_id: policyId, status: 'deleted' };
  });

  // ─── TOTP two-factor authentication ──────────────────────────────

  // POST /v1/owner/totp/setup
  app.post('/v1/owner/totp/setup', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const owner = readOwnerFile(dataDir, session.sub);

    const secret = generateTotpSecret();
    const uri = generateTotpUri(secret, owner.display_name);
    const { codes, hashes } = generateBackupCodes();

    owner.totp_secret_b32 = secret;
    owner.totp_enabled = false;
    owner.totp_backup_codes_hash = hashes;
    writeOwnerFile(dataDir, owner);

    const qr_svg = generateTotpQrSvg(uri);

    return { secret, uri, qr_svg, backup_codes: codes };
  });

  // POST /v1/owner/totp/confirm
  app.post('/v1/owner/totp/confirm', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const body = request.body as { code: string };
    const owner = readOwnerFile(dataDir, session.sub);

    if (!owner.totp_secret_b32) {
      reply.code(400).send({
        error: { code: 'TOTP_NOT_SETUP', message: 'TOTP setup has not been initiated' },
      });
      return;
    }

    if (!verifyTotp(owner.totp_secret_b32, body.code)) {
      reply.code(400).send({
        error: { code: 'INVALID_TOTP_CODE', message: 'Invalid TOTP code' },
      });
      return;
    }

    owner.totp_enabled = true;
    owner.totp_enabled_at = new Date().toISOString();
    writeOwnerFile(dataDir, owner);

    appendAuditEvent(dataDir, 'OWNER_TOTP_ENABLED', {
      owner_principal_id: session.sub,
    });

    return { status: 'totp_enabled' };
  });

  // POST /v1/owner/totp/disable
  app.post('/v1/owner/totp/disable', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const body = request.body as { code: string };
    const owner = readOwnerFile(dataDir, session.sub);

    if (!owner.totp_enabled || !owner.totp_secret_b32) {
      reply.code(400).send({
        error: { code: 'TOTP_NOT_ENABLED', message: 'TOTP is not enabled' },
      });
      return;
    }

    // Accept either a TOTP code or a backup code
    let valid = verifyTotp(owner.totp_secret_b32, body.code);
    if (!valid && owner.totp_backup_codes_hash) {
      const result = verifyBackupCode(body.code, owner.totp_backup_codes_hash);
      valid = result.valid;
    }

    if (!valid) {
      reply.code(400).send({
        error: { code: 'INVALID_TOTP_CODE', message: 'Invalid TOTP or backup code' },
      });
      return;
    }

    delete owner.totp_secret_b32;
    delete owner.totp_enabled;
    delete owner.totp_enabled_at;
    delete owner.totp_backup_codes_hash;
    writeOwnerFile(dataDir, owner);

    appendAuditEvent(dataDir, 'OWNER_TOTP_DISABLED', {
      owner_principal_id: session.sub,
    });

    return { status: 'totp_disabled' };
  });

  // ─── TOTP verification helper ──────────────────────────────────────

  async function verifyTotpForApproval(
    request: FastifyRequest,
    reply: FastifyReply,
    owner: { totp_enabled?: boolean; totp_secret_b32?: string; totp_backup_codes_hash?: string[] },
    session: SessionClaims,
  ): Promise<boolean> {
    // If require_totp is set but owner hasn't set up TOTP, block
    if (config.security.require_totp && !owner.totp_enabled) {
      reply.code(403).send({
        error: { code: 'TOTP_SETUP_REQUIRED', message: 'Two-factor authentication setup is required' },
      });
      return false;
    }

    if (!owner.totp_enabled) return true;

    const body = request.body as { totp_code?: string } | null;
    const code = body?.totp_code;

    if (!code) {
      reply.code(403).send({
        error: { code: 'TOTP_REQUIRED', message: 'Two-factor authentication code is required' },
      });
      return false;
    }

    // Try TOTP code first
    if (owner.totp_secret_b32 && verifyTotp(owner.totp_secret_b32, code)) {
      return true;
    }

    // Try backup code
    if (owner.totp_backup_codes_hash) {
      const result = verifyBackupCode(code, owner.totp_backup_codes_hash);
      if (result.valid) {
        owner.totp_backup_codes_hash = result.remainingHashes;
        writeOwnerFile(dataDir, owner as import('@openleash/core').OwnerFrontmatter);

        appendAuditEvent(dataDir, 'OWNER_TOTP_BACKUP_USED', {
          owner_principal_id: session.sub,
          remaining_codes: result.remainingHashes.length,
        });
        return true;
      }
    }

    reply.code(403).send({
      error: { code: 'TOTP_REQUIRED', message: 'Invalid two-factor authentication code' },
    });
    return false;
  }

  // ─── Approval requests (scoped to owner) ─────────────────────────

  // GET /v1/owner/approval-requests
  app.get('/v1/owner/approval-requests', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const query = request.query as { status?: string };

    const state = readState(dataDir);
    let requests = (state.approval_requests ?? [])
      .filter((r) => r.owner_principal_id === session.sub);

    if (query.status) {
      requests = requests.filter((r) => r.status === query.status);
    }

    const details = requests.map((entry) => {
      try {
        return readApprovalRequestFile(dataDir, entry.approval_request_id);
      } catch {
        return { approval_request_id: entry.approval_request_id, error: 'file_not_found' };
      }
    });

    return { approval_requests: details };
  });

  // GET /v1/owner/approval-requests/:id
  app.get('/v1/owner/approval-requests/:id', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };

    const state = readState(dataDir);
    const entry = (state.approval_requests ?? []).find(
      (r) => r.approval_request_id === id && r.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Approval request not found' },
      });
      return;
    }

    try {
      return readApprovalRequestFile(dataDir, id);
    } catch {
      reply.code(404).send({
        error: { code: 'FILE_NOT_FOUND', message: 'Approval request file not found' },
      });
    }
  });

  // POST /v1/owner/approval-requests/:id/approve
  app.post('/v1/owner/approval-requests/:id/approve', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };

    const state = readState(dataDir);
    const entry = (state.approval_requests ?? []).find(
      (r) => r.approval_request_id === id && r.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Approval request not found' },
      });
      return;
    }

    // TOTP verification
    const approveOwner = readOwnerFile(dataDir, session.sub);
    if (!(await verifyTotpForApproval(request, reply, approveOwner, session))) return;

    const req = readApprovalRequestFile(dataDir, id);

    if (req.status !== 'PENDING') {
      reply.code(400).send({
        error: { code: 'INVALID_STATUS', message: `Cannot approve request with status ${req.status}` },
      });
      return;
    }

    // Check expiry
    if (new Date(req.expires_at).getTime() < Date.now()) {
      req.status = 'EXPIRED';
      writeApprovalRequestFile(dataDir, req);
      entry.status = 'EXPIRED';
      writeState(dataDir, state);

      reply.code(400).send({
        error: { code: 'REQUEST_EXPIRED', message: 'Approval request has expired' },
      });
      return;
    }

    // Issue approval token
    const activeKey = readKeyFile(dataDir, state.server_keys.active_kid);
    const ttl = config.approval?.token_ttl_seconds ?? 3600;
    const approvalToken = await issueApprovalToken({
      key: activeKey,
      approvalRequestId: id,
      ownerPrincipalId: session.sub,
      agentId: req.agent_id,
      actionType: req.action_type,
      actionHash: req.action_hash,
      ttlSeconds: ttl,
    });

    req.status = 'APPROVED';
    req.approval_token = approvalToken.token;
    req.approval_token_expires_at = approvalToken.expiresAt;
    req.resolved_at = new Date().toISOString();
    req.resolved_by = session.sub;
    writeApprovalRequestFile(dataDir, req);

    entry.status = 'APPROVED';
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'APPROVAL_REQUEST_APPROVED', {
      approval_request_id: id,
      owner_principal_id: session.sub,
      agent_id: req.agent_id,
      action_type: req.action_type,
      agent_principal_id: req.agent_principal_id,
    });

    return {
      approval_request_id: id,
      status: 'APPROVED',
      approval_token: approvalToken.token,
      approval_token_expires_at: approvalToken.expiresAt,
    };
  });

  // POST /v1/owner/approval-requests/:id/deny
  app.post('/v1/owner/approval-requests/:id/deny', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: string; totp_code?: string } | null;

    // TOTP verification
    const denyOwner = readOwnerFile(dataDir, session.sub);
    if (!(await verifyTotpForApproval(request, reply, denyOwner, session))) return;

    const state = readState(dataDir);
    const entry = (state.approval_requests ?? []).find(
      (r) => r.approval_request_id === id && r.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Approval request not found' },
      });
      return;
    }

    const req = readApprovalRequestFile(dataDir, id);

    if (req.status !== 'PENDING') {
      reply.code(400).send({
        error: { code: 'INVALID_STATUS', message: `Cannot deny request with status ${req.status}` },
      });
      return;
    }

    req.status = 'DENIED';
    req.denial_reason = body?.reason ?? null;
    req.resolved_at = new Date().toISOString();
    req.resolved_by = session.sub;
    writeApprovalRequestFile(dataDir, req);

    entry.status = 'DENIED';
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'APPROVAL_REQUEST_DENIED', {
      approval_request_id: id,
      owner_principal_id: session.sub,
      agent_id: req.agent_id,
      action_type: req.action_type,
      agent_principal_id: req.agent_principal_id,
      reason: body?.reason ?? null,
    });

    return {
      approval_request_id: id,
      status: 'DENIED',
    };
  });

  // ─── Policy drafts (owner-facing) ──────────────────────────────────

  // GET /v1/owner/policy-drafts
  app.get('/v1/owner/policy-drafts', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const query = request.query as { status?: string };

    const state = readState(dataDir);
    let drafts = (state.policy_drafts ?? [])
      .filter((d) => d.owner_principal_id === session.sub);

    if (query.status) {
      drafts = drafts.filter((d) => d.status === query.status);
    }

    const details = drafts.map((entry) => {
      try {
        return readPolicyDraftFile(dataDir, entry.policy_draft_id);
      } catch {
        return { policy_draft_id: entry.policy_draft_id, error: 'file_not_found' };
      }
    });

    return { policy_drafts: details };
  });

  // GET /v1/owner/policy-drafts/:id
  app.get('/v1/owner/policy-drafts/:id', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };

    const state = readState(dataDir);
    const entry = (state.policy_drafts ?? []).find(
      (d) => d.policy_draft_id === id && d.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy draft not found' },
      });
      return;
    }

    try {
      return readPolicyDraftFile(dataDir, id);
    } catch {
      reply.code(404).send({
        error: { code: 'FILE_NOT_FOUND', message: 'Policy draft file not found' },
      });
    }
  });

  // POST /v1/owner/policy-drafts/:id/approve
  app.post('/v1/owner/policy-drafts/:id/approve', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };

    const state = readState(dataDir);
    const entry = (state.policy_drafts ?? []).find(
      (d) => d.policy_draft_id === id && d.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy draft not found' },
      });
      return;
    }

    // TOTP verification
    const approveOwner = readOwnerFile(dataDir, session.sub);
    if (!(await verifyTotpForApproval(request, reply, approveOwner, session))) return;

    const draft = readPolicyDraftFile(dataDir, id);

    if (draft.status !== 'PENDING') {
      reply.code(400).send({
        error: { code: 'INVALID_STATUS', message: `Cannot approve draft with status ${draft.status}` },
      });
      return;
    }

    // Re-validate the policy YAML (defensive)
    try {
      parsePolicyYaml(draft.policy_yaml);
    } catch (e: unknown) {
      reply.code(400).send({
        error: { code: 'INVALID_POLICY', message: (e as Error).message },
      });
      return;
    }

    // Create the real policy
    const policyId = crypto.randomUUID();
    writePolicyFile(dataDir, policyId, draft.policy_yaml);

    const appliesToAgent = draft.applies_to_agent_principal_id;

    state.policies.push({
      policy_id: policyId,
      owner_principal_id: session.sub,
      applies_to_agent_principal_id: appliesToAgent,
      name: draft.name ?? null,
      description: draft.description ?? null,
      path: `./policies/${policyId}.yaml`,
    });

    state.bindings.push({
      owner_principal_id: session.sub,
      policy_id: policyId,
      applies_to_agent_principal_id: appliesToAgent,
    });

    // Update the draft
    draft.status = 'APPROVED';
    draft.resulting_policy_id = policyId;
    draft.resolved_at = new Date().toISOString();
    draft.resolved_by = session.sub;
    writePolicyDraftFile(dataDir, draft);

    entry.status = 'APPROVED';
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_DRAFT_APPROVED', {
      policy_draft_id: id,
      policy_id: policyId,
      owner_principal_id: session.sub,
      agent_id: draft.agent_id,
      agent_principal_id: draft.agent_principal_id,
      applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
    });

    return {
      policy_draft_id: id,
      status: 'APPROVED',
      policy_id: policyId,
      applies_to_agent_principal_id: appliesToAgent,
    };
  });

  // POST /v1/owner/policy-drafts/:id/deny
  app.post('/v1/owner/policy-drafts/:id/deny', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: string; totp_code?: string } | null;

    // TOTP verification
    const denyOwner = readOwnerFile(dataDir, session.sub);
    if (!(await verifyTotpForApproval(request, reply, denyOwner, session))) return;

    const state = readState(dataDir);
    const entry = (state.policy_drafts ?? []).find(
      (d) => d.policy_draft_id === id && d.owner_principal_id === session.sub
    );

    if (!entry) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Policy draft not found' },
      });
      return;
    }

    const draft = readPolicyDraftFile(dataDir, id);

    if (draft.status !== 'PENDING') {
      reply.code(400).send({
        error: { code: 'INVALID_STATUS', message: `Cannot deny draft with status ${draft.status}` },
      });
      return;
    }

    draft.status = 'DENIED';
    draft.denial_reason = body?.reason ?? null;
    draft.resolved_at = new Date().toISOString();
    draft.resolved_by = session.sub;
    writePolicyDraftFile(dataDir, draft);

    entry.status = 'DENIED';
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'POLICY_DRAFT_DENIED', {
      policy_draft_id: id,
      owner_principal_id: session.sub,
      agent_id: draft.agent_id,
      agent_principal_id: draft.agent_principal_id,
      applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
      reason: body?.reason ?? null,
    });

    return {
      policy_draft_id: id,
      status: 'DENIED',
    };
  });

  // ─── Owner audit ──────────────────────────────────────────────────

  // GET /v1/owner/audit
  app.get('/v1/owner/audit', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const query = request.query as { limit?: string; cursor?: string };
    const limit = query.limit ? Math.max(1, Math.min(parseInt(query.limit, 10) || 1, 1000)) : 50;
    const cursor = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;

    const result = readAuditLog(dataDir, limit * 5, cursor); // Read more to compensate for filtering

    // Find this owner's agents for filtering
    const state = readState(dataDir);
    const ownerAgentIds = new Set(
      state.agents
        .filter((a) => a.owner_principal_id === session.sub)
        .map((a) => a.agent_principal_id)
    );

    // Filter to events related to this owner
    const filtered = result.items.filter((event) => {
      const meta = event.metadata_json;
      if (meta.owner_principal_id === session.sub) return true;
      if (meta.agent_principal_id && ownerAgentIds.has(meta.agent_principal_id as string)) return true;
      if (event.principal_id && ownerAgentIds.has(event.principal_id)) return true;
      return false;
    });

    return {
      items: filtered.slice(0, limit),
      next_cursor: result.next_cursor,
    };
  });
}
