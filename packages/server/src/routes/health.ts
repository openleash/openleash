import type { FastifyInstance } from 'fastify';
import { getVersion } from '../version.js';

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/v1/health', async () => {
    return {
      status: 'ok',
      time: new Date().toISOString(),
      version: getVersion(),
    };
  });
}
