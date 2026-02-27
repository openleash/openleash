import type { FastifyInstance } from 'fastify';

export function registerReferenceRoutes(
  app: FastifyInstance,
  spec: Record<string, unknown>
) {
  app.register(
    async (instance) => {
      const { default: scalarPlugin } = await import(
        '@scalar/fastify-api-reference'
      );
      await instance.register(scalarPlugin, {
        routePrefix: '/reference',
        configuration: {
          content: spec,
        },
      });
    },
  );
}
