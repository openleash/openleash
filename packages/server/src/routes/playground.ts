import type { FastifyInstance } from 'fastify';
import {
  ActionRequestSchema,
  parsePolicyYaml,
  evaluate,
  computeActionHash,
} from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';

export function registerPlaygroundRoutes(app: FastifyInstance, config: OpenleashConfig) {
  app.post('/v1/playground/run', async (request, reply) => {
    const body = request.body as {
      policy_yaml: string;
      action: unknown;
    };

    if (!body.policy_yaml || !body.action) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'policy_yaml and action are required' },
      });
      return;
    }

    // Validate action
    const parseResult = ActionRequestSchema.safeParse(body.action);
    if (!parseResult.success) {
      reply.code(400).send({
        error: {
          code: 'INVALID_ACTION_REQUEST',
          message: 'Invalid action request',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    // Parse policy
    let policy;
    try {
      policy = parsePolicyYaml(body.policy_yaml);
    } catch (e: unknown) {
      reply.code(400).send({
        error: { code: 'INVALID_POLICY', message: (e as Error).message },
      });
      return;
    }

    const action = parseResult.data;
    const actionHash = computeActionHash(action);
    const result = evaluate(action, policy, {
      defaultProofTtl: config.tokens.default_ttl_seconds,
    });

    return {
      action_hash: actionHash,
      decision: result.response,
      debug: { trace: result.trace.rules },
    };
  });
}
