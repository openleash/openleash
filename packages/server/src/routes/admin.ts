import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  writeState,
  writeOwnerFile,
  writePolicyFile,
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

  // GET /v1/admin/audit
  app.get('/v1/admin/audit', { preHandler: adminAuth }, async (request) => {
    const query = request.query as { limit?: string; cursor?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const cursor = query.cursor ? parseInt(query.cursor, 10) : 0;
    return readAuditLog(dataDir, limit, cursor);
  });
}
