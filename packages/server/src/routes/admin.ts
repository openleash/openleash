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
} from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';
import { createAdminAuth } from '../middleware/admin-auth.js';

export function registerAdminRoutes(app: FastifyInstance, dataDir: string, config: OpenleashConfig) {
  const adminAuth = createAdminAuth(config);

  // POST /v1/admin/owners
  app.post('/v1/admin/owners', { preHandler: adminAuth }, async (request) => {
    const body = request.body as {
      principal_type: 'HUMAN' | 'ORG';
      display_name: string;
      attributes_json?: Record<string, unknown>;
    };

    const ownerId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    writeOwnerFile(dataDir, {
      owner_principal_id: ownerId,
      principal_type: body.principal_type,
      display_name: body.display_name,
      status: 'ACTIVE',
      attributes: body.attributes_json ?? {},
      created_at: createdAt,
    });

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
      created_at: createdAt,
    };
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
