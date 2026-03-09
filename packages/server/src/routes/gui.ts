import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  readOwnerFile,
  readAgentFile,
  readPolicyFile,
  readAuditLog,
  readApprovalRequestFile,
} from '@openleash/core';
import type { OpenleashConfig, SessionClaims } from '@openleash/core';
import {
  renderDashboard,
  renderOwners,
  renderOwnerDetail,
  renderAgents,
  renderPolicies,
  renderPolicyViewer,
  renderConfig,
  renderAudit,
  renderOwnerLogin,
  renderOwnerSetup,
  renderOwnerDashboard,
  renderOwnerApprovals,
  renderOwnerAgents,
  renderOwnerPolicies,
  renderOwnerProfile,
  renderInitialSetup,
  renderApiReference,
  renderApiReferenceUnavailable,
} from '@openleash/gui';
import { createAdminAuth } from '../middleware/admin-auth.js';
import { createOwnerAuth } from '../middleware/owner-auth.js';
import { getVersion } from '../version.js';
import { bootstrapState } from '../bootstrap.js';

export interface GuiRoutesOptions {
  hasApiReference?: boolean;
}

export function registerGuiRoutes(app: FastifyInstance, dataDir: string, config: OpenleashConfig, options?: GuiRoutesOptions) {
  const adminAuth = createAdminAuth(config);
  const rootDir = path.dirname(dataDir);
  const statePath = path.join(dataDir, 'state.md');

  // Guard: if the data directory or state file is missing, re-bootstrap and
  // redirect to the initial setup page so the user can start fresh.
  app.addHook('onRequest', async (request, reply) => {
    if (!fs.existsSync(statePath)) {
      bootstrapState(rootDir);
      // Let setup-related routes through without redirect
      const url = request.url.split('?')[0];
      if (url === '/gui' || url === '/gui/setup') return;
      reply.redirect('/gui');
    }
  });

  // Redirect /gui — if no owners, go to setup; otherwise dashboard
  app.get('/gui', async (_request, reply) => {
    const state = readState(dataDir);
    if (state.owners.length === 0) {
      reply.redirect('/gui/setup');
      return;
    }
    reply.redirect('/gui/dashboard');
  });

  // Initial setup page (no auth)
  app.get('/gui/setup', async (_request, reply) => {
    const state = readState(dataDir);
    if (state.owners.length > 0) {
      reply.redirect('/gui/dashboard');
      return;
    }
    const html = renderInitialSetup();
    reply.type('text/html').send(html);
  });

  // Dashboard
  app.get('/gui/dashboard', { preHandler: adminAuth }, async (_request, reply) => {
    const state = readState(dataDir);
    const stateData = {
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

    const html = renderDashboard({
      state: stateData,
      health: { status: 'ok', version: getVersion() },
    });
    reply.type('text/html').send(html);
  });

  // Owners
  app.get('/gui/owners', { preHandler: adminAuth }, async (_request, reply) => {
    const state = readState(dataDir);
    const owners = state.owners.map((entry) => {
      try {
        return readOwnerFile(dataDir, entry.owner_principal_id);
      } catch {
        return { owner_principal_id: entry.owner_principal_id, error: 'file_not_found' } as { owner_principal_id: string; error: string };
      }
    });
    const html = renderOwners(owners);
    reply.type('text/html').send(html);
  });

  // Owner detail
  app.get('/gui/owners/:ownerId', { preHandler: adminAuth }, async (request, reply) => {
    const { ownerId } = request.params as { ownerId: string };
    const state = readState(dataDir);
    const entry = state.owners.find((o) => o.owner_principal_id === ownerId);

    if (!entry) {
      reply.code(404).type('text/html').send('<h1>Owner not found</h1>');
      return;
    }

    try {
      const owner = readOwnerFile(dataDir, ownerId);

      // Agents belonging to this owner
      const agents = state.agents
        .filter((a) => a.owner_principal_id === ownerId)
        .map((a) => {
          try {
            const agent = readAgentFile(dataDir, a.agent_principal_id);
            return {
              agent_id: agent.agent_id,
              agent_principal_id: agent.agent_principal_id,
              status: agent.status,
              created_at: agent.created_at,
            };
          } catch {
            return { agent_id: a.agent_id, agent_principal_id: a.agent_principal_id, status: 'UNKNOWN', created_at: '' };
          }
        });

      // Policies for this owner
      const policies = state.policies
        .filter((p) => p.owner_principal_id === ownerId)
        .map((p) => ({
          policy_id: p.policy_id,
          applies_to_agent_principal_id: p.applies_to_agent_principal_id,
        }));

      // Audit events related to this owner
      const allAudit = readAuditLog(dataDir, 10000, 0);
      const ownerAudit = allAudit.items
        .filter((e) =>
          e.principal_id === ownerId ||
          (e.metadata_json && (e.metadata_json as Record<string, unknown>).owner_principal_id === ownerId)
        )
        .reverse()
        .slice(0, 50);

      // Resolve signatory human owner names for ORG owners
      const linkedHumans: { owner_principal_id: string; display_name: string }[] = [];
      if (owner.principal_type === 'ORG' && owner.signatories?.length) {
        const humanIds = new Set(owner.signatories.map((s) => s.human_owner_principal_id));
        for (const hid of humanIds) {
          try {
            const h = readOwnerFile(dataDir, hid);
            linkedHumans.push({ owner_principal_id: h.owner_principal_id, display_name: h.display_name });
          } catch {
            linkedHumans.push({ owner_principal_id: hid, display_name: hid.slice(0, 8) + '...' });
          }
        }
      }

      const ownerWithMeta = { ...owner, has_passphrase: !!owner.passphrase_hash };
      const html = renderOwnerDetail({ owner: ownerWithMeta, agents, policies, audit: ownerAudit, linked_humans: linkedHumans });
      reply.type('text/html').send(html);
    } catch {
      reply.code(404).type('text/html').send('<h1>Owner file not found</h1>');
    }
  });

  // Agents
  app.get('/gui/agents', { preHandler: adminAuth }, async (_request, reply) => {
    const state = readState(dataDir);
    const agents = state.agents.map((entry) => {
      try {
        return readAgentFile(dataDir, entry.agent_principal_id);
      } catch {
        return { agent_principal_id: entry.agent_principal_id, agent_id: entry.agent_id, error: 'file_not_found' } as { agent_principal_id: string; agent_id: string; error: string };
      }
    });
    const owners = state.owners.map((entry) => {
      try {
        const o = readOwnerFile(dataDir, entry.owner_principal_id);
        return { owner_principal_id: o.owner_principal_id, display_name: o.display_name };
      } catch {
        return { owner_principal_id: entry.owner_principal_id, display_name: entry.owner_principal_id.slice(0, 8) };
      }
    });
    const html = renderAgents(agents, owners);
    reply.type('text/html').send(html);
  });

  // Policies list
  app.get('/gui/policies', { preHandler: adminAuth }, async (_request, reply) => {
    const state = readState(dataDir);
    const policies = state.policies.map((entry) => {
      try {
        const yaml = readPolicyFile(dataDir, entry.policy_id);
        return { ...entry, policy_yaml: yaml };
      } catch {
        return { ...entry, error: 'file_not_found' };
      }
    });

    const html = renderPolicies(policies);
    reply.type('text/html').send(html);
  });

  // Policy viewer
  app.get('/gui/policies/:policyId', { preHandler: adminAuth }, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const state = readState(dataDir);
    const entry = state.policies.find((p) => p.policy_id === policyId);

    if (!entry) {
      reply.code(404).type('text/html').send('<h1>Policy not found</h1>');
      return;
    }

    try {
      const yaml = readPolicyFile(dataDir, policyId);
      const ownerNames = new Map(state.owners.map((o) => {
        try { return [o.owner_principal_id, readOwnerFile(dataDir, o.owner_principal_id).display_name] as const; }
        catch { return [o.owner_principal_id, undefined] as const; }
      }));
      const agentNames = new Map(state.agents.map((a) => [a.agent_principal_id, a.agent_id]));
      const html = renderPolicyViewer({
        policy_id: policyId,
        owner_principal_id: entry.owner_principal_id,
        applies_to_agent_principal_id: entry.applies_to_agent_principal_id,
        policy_yaml: yaml,
      }, state.bindings, { owners: ownerNames as Map<string, string>, agents: agentNames });
      reply.type('text/html').send(html);
    } catch {
      reply.code(404).type('text/html').send('<h1>Policy file not found</h1>');
    }
  });

  // Config
  app.get('/gui/config', { preHandler: adminAuth }, async (_request, reply) => {
    const configData = {
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
    const html = renderConfig(configData);
    reply.type('text/html').send(html);
  });

  // Audit log
  app.get('/gui/audit', { preHandler: adminAuth }, async (request, reply) => {
    const query = request.query as { cursor?: string };
    const cursor = query.cursor ? parseInt(query.cursor, 10) : 0;
    const data = readAuditLog(dataDir, 100, cursor);
    const state = readState(dataDir);
    const ownerNames = new Map(state.owners.map((o) => {
      try { return [o.owner_principal_id, readOwnerFile(dataDir, o.owner_principal_id).display_name] as const; }
      catch { return [o.owner_principal_id, undefined] as const; }
    }));
    const agentNames = new Map(state.agents.map((a) => [a.agent_principal_id, a.agent_id]));
    const eventTypes = [...new Set(data.items.map((e) => e.event_type))].sort();
    const html = renderAudit(data, cursor, { owners: ownerNames as Map<string, string>, agents: agentNames, eventTypes });
    reply.type('text/html').send(html);
  });

  // API Reference (embedded Scalar)
  app.get('/gui/api-reference', { preHandler: adminAuth }, async (_request, reply) => {
    const html = options?.hasApiReference ? renderApiReference() : renderApiReferenceUnavailable();
    reply.type('text/html').send(html);
  });

  // ─── Owner GUI routes ─────────────────────────────────────────────

  const ownerAuth = createOwnerAuth(config, dataDir);

  // Login page (no auth)
  app.get('/gui/owner/login', async (_request, reply) => {
    const html = renderOwnerLogin();
    reply.type('text/html').send(html);
  });

  // Setup page (no auth — invite token acts as proof)
  app.get('/gui/owner/setup', async (_request, reply) => {
    const html = renderOwnerSetup();
    reply.type('text/html').send(html);
  });

  // Owner dashboard
  app.get('/gui/owner/dashboard', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const state = readState(dataDir);
    const owner = readOwnerFile(dataDir, session.sub);

    const agentCount = state.agents.filter((a) => a.owner_principal_id === session.sub).length;
    const policyCount = state.policies.filter((p) => p.owner_principal_id === session.sub).length;
    const pendingApprovals = (state.approval_requests ?? [])
      .filter((r) => r.owner_principal_id === session.sub && r.status === 'PENDING').length;

    const html = renderOwnerDashboard({
      display_name: owner.display_name,
      agent_count: agentCount,
      policy_count: policyCount,
      pending_approvals: pendingApprovals,
    });
    reply.type('text/html').send(html);
  });

  // Owner agents
  app.get('/gui/owner/agents', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const state = readState(dataDir);
    const agents = state.agents
      .filter((a) => a.owner_principal_id === session.sub)
      .map((entry) => {
        try {
          const agent = readAgentFile(dataDir, entry.agent_principal_id);
          return {
            agent_principal_id: agent.agent_principal_id,
            agent_id: agent.agent_id,
            status: agent.status,
            created_at: agent.created_at,
            revoked_at: agent.revoked_at,
          };
        } catch {
          return {
            agent_principal_id: entry.agent_principal_id,
            agent_id: entry.agent_id,
            status: 'UNKNOWN',
            created_at: '',
            revoked_at: null,
          };
        }
      });
    const html = renderOwnerAgents(agents);
    reply.type('text/html').send(html);
  });

  // Owner policies
  app.get('/gui/owner/policies', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const state = readState(dataDir);
    const policies = state.policies
      .filter((p) => p.owner_principal_id === session.sub)
      .map((entry) => {
        try {
          const yaml = readPolicyFile(dataDir, entry.policy_id);
          return { policy_id: entry.policy_id, applies_to_agent_principal_id: entry.applies_to_agent_principal_id, policy_yaml: yaml };
        } catch {
          return { policy_id: entry.policy_id, applies_to_agent_principal_id: entry.applies_to_agent_principal_id };
        }
      });
    const html = renderOwnerPolicies(policies);
    reply.type('text/html').send(html);
  });

  // Owner approvals
  app.get('/gui/owner/approvals', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const state = readState(dataDir);
    const approvalEntries = (state.approval_requests ?? [])
      .filter((r) => r.owner_principal_id === session.sub);

    const approvals = approvalEntries.map((entry) => {
      try {
        const req = readApprovalRequestFile(dataDir, entry.approval_request_id);
        return {
          approval_request_id: req.approval_request_id,
          agent_id: req.agent_id,
          action_type: req.action_type,
          justification: req.justification,
          status: req.status,
          created_at: req.created_at,
          expires_at: req.expires_at,
        };
      } catch {
        return {
          approval_request_id: entry.approval_request_id,
          agent_id: 'unknown',
          action_type: 'unknown',
          justification: null,
          status: entry.status,
          created_at: '',
          expires_at: '',
        };
      }
    });
    const approvalOwner = readOwnerFile(dataDir, session.sub);
    const html = renderOwnerApprovals(approvals, {
      totp_enabled: !!approvalOwner.totp_enabled,
      require_totp: !!config.security.require_totp,
    });
    reply.type('text/html').send(html);
  });

  // Owner profile
  app.get('/gui/owner/profile', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const owner = readOwnerFile(dataDir, session.sub);

    const html = renderOwnerProfile({
      owner_principal_id: owner.owner_principal_id,
      principal_type: owner.principal_type,
      display_name: owner.display_name,
      status: owner.status,
      identity_assurance_level: owner.identity_assurance_level,
      contact_identities: owner.contact_identities,
      government_ids: owner.government_ids,
      company_ids: owner.company_ids,
      created_at: owner.created_at,
      totp_enabled: !!owner.totp_enabled,
      totp_enabled_at: owner.totp_enabled_at,
      totp_backup_codes_remaining: owner.totp_backup_codes_hash?.length,
    });
    reply.type('text/html').send(html);
  });

  // Owner audit
  app.get('/gui/owner/audit', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const query = request.query as { cursor?: string };
    const cursor = query.cursor ? parseInt(query.cursor, 10) : 0;
    const data = readAuditLog(dataDir, 500, cursor);
    const state = readState(dataDir);

    const ownerAgentIds = new Set(
      state.agents
        .filter((a) => a.owner_principal_id === session.sub)
        .map((a) => a.agent_principal_id)
    );

    const filtered = data.items.filter((event) => {
      const meta = event.metadata_json as Record<string, unknown>;
      if (meta.owner_principal_id === session.sub) return true;
      if (meta.agent_principal_id && ownerAgentIds.has(meta.agent_principal_id as string)) return true;
      if (event.principal_id && ownerAgentIds.has(event.principal_id)) return true;
      return false;
    });

    const ownerNames = new Map([[session.sub, readOwnerFile(dataDir, session.sub).display_name]]);
    const agentNames = new Map(
      state.agents
        .filter((a) => a.owner_principal_id === session.sub)
        .map((a) => [a.agent_principal_id, a.agent_id])
    );
    const eventTypes = [...new Set(filtered.map((e) => e.event_type))].sort();

    const html = renderAudit(
      { items: filtered.slice(0, 100), next_cursor: data.next_cursor },
      cursor,
      { owners: ownerNames, agents: agentNames, eventTypes },
      'owner'
    );
    reply.type('text/html').send(html);
  });
}
