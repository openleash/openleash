import Fastify from 'fastify';
import { NonceCache } from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';
import { registerHealthRoutes } from './routes/health.js';
import { registerPublicKeysRoutes } from './routes/public-keys.js';
import { registerVerifyProofRoutes } from './routes/verify-proof.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAuthorizeRoutes } from './routes/authorize.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerPlaygroundRoutes } from './routes/playground.js';

export interface CreateServerOptions {
  config: OpenleashConfig;
  dataDir: string;
}

export function createServer(options: CreateServerOptions) {
  const { config, dataDir } = options;

  const app = Fastify({
    logger: true,
  });

  // Add raw body support for signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as unknown as Record<string, unknown>).rawBody = body;
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  const nonceCache = new NonceCache(config.security.nonce_ttl_seconds);

  // Register routes
  registerHealthRoutes(app);
  registerPublicKeysRoutes(app, dataDir);
  registerVerifyProofRoutes(app, dataDir);
  registerAgentRoutes(app, dataDir);
  registerAuthorizeRoutes(app, dataDir, config, nonceCache);
  registerAdminRoutes(app, dataDir, config);
  registerPlaygroundRoutes(app, config);

  return { app, nonceCache };
}
