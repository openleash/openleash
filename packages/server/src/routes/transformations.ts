import * as crypto from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { NonceCache, TransformationRule } from '@openleash/core';
import type {
  DataStore,
  OpenleashConfig,
  OpenleashEvents,
  ServerPluginManifest,
  SessionClaims,
  StateAgentEntry,
  TransformationFrontmatter,
} from '@openleash/core';
import { createAgentAuth } from '../middleware/agent-auth.js';
import { createOwnerAuth } from '../middleware/owner-auth.js';
import { validateBody } from '../validate.js';

const CreateTransformationSchema = z.object({
  rule: TransformationRule,
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  applies_to_agent_principal_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
});

const UpdateTransformationSchema = z.object({
  rule: TransformationRule.optional(),
  name: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * Output-transformation routes.
 *
 * Owner-authenticated CRUD (`/v1/owner/transformations`) lets a human configure
 * the rules; the agent-authenticated `GET /v1/agent/transformations` is what a
 * post-tool-call hook fetches (each invocation in the MVP) to learn which
 * transformations to apply to a tool's output.
 */
export function registerTransformationRoutes(
  app: FastifyInstance,
  store: DataStore,
  config: OpenleashConfig,
  nonceCache: NonceCache,
  pluginManifest?: ServerPluginManifest,
) {
  const agentAuth = createAgentAuth(config, store, nonceCache);
  const ownerAuth = createOwnerAuth(config, store, pluginManifest);

  function nextRank(ownerType: 'user' | 'org', ownerId: string): number {
    const existing = store.transformations.listByOwner(ownerType, ownerId);
    if (existing.length === 0) return 100;
    return Math.max(...existing.map((t) => t.rank)) + 100;
  }

  // ─── Agent-facing: fetch applicable transformation rules ───────────
  // Returns enabled transformations for the calling agent's owner that apply
  // either to all agents or to this specific agent, ordered by rank.
  app.get('/v1/agent/transformations', { preHandler: agentAuth }, async (request) => {
    const agentEntry = (request as unknown as Record<string, unknown>).agentEntry as StateAgentEntry;

    const transformations = store.transformations
      .listByOwner(agentEntry.owner_type, agentEntry.owner_id)
      .filter(
        (t) =>
          t.enabled &&
          (t.applies_to_agent_principal_id === null ||
            t.applies_to_agent_principal_id === agentEntry.agent_principal_id),
      )
      .sort((a, b) => a.rank - b.rank)
      .map((t) => ({
        transformation_id: t.transformation_id,
        name: t.name,
        rank: t.rank,
        ...t.rule,
      }));

    return { transformations };
  });

  // ─── Owner-facing CRUD (user scope) ────────────────────────────────

  // GET /v1/owner/transformations
  app.get('/v1/owner/transformations', { preHandler: ownerAuth }, async (request) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const transformations = store.transformations
      .listByOwner('user', session.sub)
      .sort((a, b) => a.rank - b.rank);
    return { transformations };
  });

  // POST /v1/owner/transformations
  app.post('/v1/owner/transformations', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const body = validateBody(request.body, CreateTransformationSchema, reply);
    if (!body) return;

    const appliesToAgent = body.applies_to_agent_principal_id ?? null;
    if (appliesToAgent) {
      const state = store.state.getState();
      const target = state.agents.find((a) => a.agent_principal_id === appliesToAgent);
      if (!target || target.owner_type !== 'user' || target.owner_id !== session.sub) {
        reply.code(400).send({
          error: { code: 'INVALID_AGENT', message: 'Target agent does not belong to you' },
        });
        return;
      }
    }

    const transformationId = crypto.randomUUID();
    const record: TransformationFrontmatter = {
      transformation_id: transformationId,
      owner_type: 'user',
      owner_id: session.sub,
      applies_to_agent_principal_id: appliesToAgent,
      name: body.name?.trim() || null,
      description: body.description?.trim() || null,
      enabled: body.enabled ?? true,
      rank: nextRank('user', session.sub),
      rule: body.rule,
      created_at: new Date().toISOString(),
    };

    store.transformations.write(record);

    store.state.updateState((s) => {
      if (!s.transformations) s.transformations = [];
      s.transformations.push({
        transformation_id: transformationId,
        owner_type: 'user',
        owner_id: session.sub,
        applies_to_agent_principal_id: appliesToAgent,
        name: record.name,
        rank: record.rank,
        path: `./transformations/${transformationId}.json`,
      });
    });

    store.audit.append('TRANSFORMATION_CREATED', {
      transformation_id: transformationId,
      user_principal_id: session.sub,
      rule_type: record.rule.type,
      applies_to_agent_principal_id: appliesToAgent,
    });

    return { transformation_id: transformationId, status: 'created' };
  });

  // PUT /v1/owner/transformations/:id
  app.put('/v1/owner/transformations/:id', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };
    const body = validateBody(request.body, UpdateTransformationSchema, reply);
    if (!body) return;

    let record: TransformationFrontmatter;
    try {
      record = store.transformations.read(id);
    } catch {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transformation not found' } });
      return;
    }
    if (record.owner_type !== 'user' || record.owner_id !== session.sub) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transformation not found' } });
      return;
    }

    if (body.rule !== undefined) record.rule = body.rule;
    if (body.name !== undefined) record.name = body.name?.trim() || null;
    if (body.description !== undefined) record.description = body.description?.trim() || null;
    if (body.enabled !== undefined) record.enabled = body.enabled;

    store.transformations.write(record);

    store.state.updateState((s) => {
      const idx = (s.transformations ?? []).findIndex((t) => t.transformation_id === id);
      if (idx !== -1 && s.transformations) {
        s.transformations[idx].name = record.name;
      }
    });

    store.audit.append('TRANSFORMATION_UPDATED', {
      transformation_id: id,
      user_principal_id: session.sub,
    });

    return { transformation_id: id, status: 'updated' };
  });

  // DELETE /v1/owner/transformations/:id
  app.delete('/v1/owner/transformations/:id', { preHandler: ownerAuth }, async (request, reply) => {
    const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims;
    const { id } = request.params as { id: string };

    let record: TransformationFrontmatter;
    try {
      record = store.transformations.read(id);
    } catch {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transformation not found' } });
      return;
    }
    if (record.owner_type !== 'user' || record.owner_id !== session.sub) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transformation not found' } });
      return;
    }

    store.transformations.delete(id);
    store.state.updateState((s) => {
      if (s.transformations) {
        s.transformations = s.transformations.filter((t) => t.transformation_id !== id);
      }
    });

    store.audit.append('TRANSFORMATION_DELETED', {
      transformation_id: id,
      user_principal_id: session.sub,
    });

    return { transformation_id: id, status: 'deleted' };
  });
}
