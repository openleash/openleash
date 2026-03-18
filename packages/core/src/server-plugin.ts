import type { DataStore } from './store.js';
import type { OpenleashConfig } from './types.js';

// ─── Plugin navigation ──────────────────────────────────────────────

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

// ─── Plugin context ─────────────────────────────────────────────────

/**
 * Context passed to server plugins during initialization.
 * The `app` field is the Fastify instance (typed as `unknown` to avoid
 * a fastify dependency in @openleash/core — plugins should cast or
 * import FastifyInstance from fastify themselves).
 */
export interface ServerPluginContext {
  app: unknown;
  store: DataStore;
  config: OpenleashConfig;
  dataDir: string;
}

// ─── Plugin manifest ────────────────────────────────────────────────

export interface ServerPluginManifest {
  ownerNavItems?: NavItem[];
  adminNavItems?: NavItem[];
  handlesRootPath?: boolean;
  replacesOwnerLogin?: boolean;
  staticAssetsDir?: string;
}

// ─── Plugin factory ─────────────────────────────────────────────────

export type CreateServerPlugin = (
  ctx: ServerPluginContext,
  options?: Record<string, unknown>,
) => ServerPluginManifest | Promise<ServerPluginManifest>;
