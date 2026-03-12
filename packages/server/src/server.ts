import * as path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import { NonceCache, FileAuditStore, StateIndex } from '@openleash/core';
import type { OpenleashConfig } from '@openleash/core';
import { initManifest } from '@openleash/gui';
import { registerHealthRoutes } from './routes/health.js';
import { registerPublicKeysRoutes } from './routes/public-keys.js';
import { registerVerifyProofRoutes } from './routes/verify-proof.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAuthorizeRoutes } from './routes/authorize.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerOwnerRoutes } from './routes/owner.js';
import { registerAgentSelfRoutes } from './routes/agent-self.js';
import { registerPlaygroundRoutes } from './routes/playground.js';
import { registerGuiRoutes } from './routes/gui.js';
import { registerReferenceRoutes } from './routes/reference.js';

// Resolve the @openleash/gui client assets directory.
// The gui package lives in the same monorepo, so we resolve relative to
// its dist/ output which sits alongside the server's dist/.
const GUI_CLIENT_DIR = path.resolve(__dirname, '../../gui/dist/client');

export interface CreateServerOptions {
  config: OpenleashConfig;
  dataDir: string;
  openapiSpec?: Record<string, unknown>;
}

export function createServer(options: CreateServerOptions) {
  const { config, dataDir, openapiSpec } = options;

  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
  });

  app.register(helmet, {
    contentSecurityPolicy: false,
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
  const auditStore = new FileAuditStore(dataDir);
  const stateIndex = new StateIndex(dataDir);

  // Register routes
  registerHealthRoutes(app, { hasApiReference: !!openapiSpec });
  registerPublicKeysRoutes(app, dataDir);
  registerVerifyProofRoutes(app, dataDir);
  registerAgentRoutes(app, dataDir);
  registerAuthorizeRoutes(app, dataDir, config, nonceCache);
  registerOwnerRoutes(app, dataDir, config, auditStore);
  registerAgentSelfRoutes(app, dataDir, config, nonceCache);
  registerAdminRoutes(app, dataDir, config, auditStore);
  registerPlaygroundRoutes(app, config);

  if (config.gui?.enabled !== false) {
    // Initialize Vite client asset manifest and serve static bundles
    initManifest(GUI_CLIENT_DIR);
    app.register(fastifyStatic, {
      root: path.join(GUI_CLIENT_DIR, 'assets'),
      prefix: '/gui/assets/',
      decorateReply: false,
      cacheControl: true,
      maxAge: '1y',
      immutable: true,
    });

    registerGuiRoutes(app, dataDir, config, auditStore, stateIndex, { hasApiReference: !!openapiSpec });
  }

  if (openapiSpec) {
    registerReferenceRoutes(app, openapiSpec);
  }

  return { app, nonceCache };
}
