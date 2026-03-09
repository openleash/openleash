import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getVersion } from '../version.js';

function getBaseUrl(request: FastifyRequest): string {
  const proto = (request.headers['x-forwarded-proto'] as string) || 'http';
  const host =
    (request.headers['x-forwarded-host'] as string) || request.headers.host || 'localhost';
  return `${proto}://${host}`;
}

export function registerHealthRoutes(
  app: FastifyInstance,
  options?: { hasApiReference?: boolean }
) {
  const hasApiReference = options?.hasApiReference ?? false;

  app.get('/v1/health', async (request) => {
    const baseUrl = getBaseUrl(request);
    return {
      status: 'ok',
      time: new Date().toISOString(),
      version: getVersion(),
      ...(hasApiReference
        ? {
            api_reference: `${baseUrl}/reference`,
            openapi_spec: `${baseUrl}/reference/openapi.json`,
          }
        : {}),
    };
  });
}
