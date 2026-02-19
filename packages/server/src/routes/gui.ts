import type { FastifyInstance } from 'fastify';
import {
  readState,
  readOwnerFile,
  readAgentFile,
  readPolicyFile,
  readAuditLog,
} from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';
import {
  renderDashboard,
  renderOwners,
  renderOwnerDetail,
  renderAgents,
  renderPolicies,
  renderPolicyEditor,
  renderConfig,
  renderAudit,
} from '@openleash/gui';
import { createAdminAuth } from '../middleware/admin-auth.js';
import { getVersion } from '../version.js';

export function registerGuiRoutes(app: FastifyInstance, dataDir: string, config: OpenleashConfig) {
  const adminAuth = createAdminAuth(config);

  // Redirect /gui to /gui/dashboard
  app.get('/gui', { preHandler: adminAuth }, async (_request, reply) => {
    reply.redirect('/gui/dashboard');
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

      const html = renderOwnerDetail({ owner, agents, policies, audit: ownerAudit });
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

  // Policy editor
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
      const html = renderPolicyEditor({
        policy_id: policyId,
        owner_principal_id: entry.owner_principal_id,
        applies_to_agent_principal_id: entry.applies_to_agent_principal_id,
        policy_yaml: yaml,
      });
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
    const html = renderAudit(data, cursor);
    reply.type('text/html').send(html);
  });
}
