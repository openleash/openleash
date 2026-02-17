import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/v1/health', async () => {
    return {
      status: 'ok',
      time: new Date().toISOString(),
      version: '0.1.0',
    };
  });
}
