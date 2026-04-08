import * as path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import { NonceCache, OpenleashEvents } from '@openleash/core';
import type { OpenleashConfig, DataStore, ServerPluginManifest } from '@openleash/core';
import { loadServerPlugin } from '@openleash/core';
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
  store: DataStore;
  openapiSpec?: Record<string, unknown>;
}

export async function createServer(options: CreateServerOptions) {
  const { config, dataDir, store, openapiSpec } = options;

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
  const events = new OpenleashEvents();

  // Load server plugin before routes so the manifest is available
  // for owner-auth and admin-auth middlewares (plugin token verification)
  let pluginManifest: ServerPluginManifest | undefined;
  if (config.plugin) {
    pluginManifest = await loadServerPlugin(config.plugin, {
      app,
      store,
      config,
      dataDir,
      events,
    });

    // Serve plugin static assets if provided
    if (pluginManifest.staticAssetsDir) {
      app.register(fastifyStatic, {
        root: pluginManifest.staticAssetsDir,
        prefix: '/plugin-assets/',
        decorateReply: false,
        cacheControl: true,
        maxAge: '1y',
        immutable: true,
      });
    }
  }

  // Register routes
  registerHealthRoutes(app, { hasApiReference: !!openapiSpec });
  registerPublicKeysRoutes(app, store);
  registerVerifyProofRoutes(app, store);
  registerAgentRoutes(app, store);
  registerAuthorizeRoutes(app, store, config, nonceCache);
  registerOwnerRoutes(app, store, config, events, pluginManifest);
  registerAgentSelfRoutes(app, store, config, nonceCache, events);
  registerAdminRoutes(app, store, config, events, pluginManifest);
  if (config.instance?.mode !== 'hosted') {
    registerPlaygroundRoutes(app, config);
  }

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

    registerGuiRoutes(app, dataDir, store, config, {
      hasApiReference: !!openapiSpec,
      pluginManifest,
    });
  }

  if (openapiSpec) {
    const baseUrl = process.env.BASE_URL || `http://${config.server.bind_address}`;
    registerReferenceRoutes(app, openapiSpec, baseUrl);
  }

  return { app, nonceCache };
}
