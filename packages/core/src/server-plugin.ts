import type { DataStore } from './store.js';
import type { OpenleashConfig } from './types.js';
import type { OpenleashEvents } from './events.js';

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
  events: OpenleashEvents;
}

// ─── Org verification provider ─────────────────────────────────────

export type { VerificationEvidence, RegistryCompanyInfo, UserFrontmatter, OrganizationFrontmatter } from './types.js';

export interface OrgVerificationProvider {
  provider_id: string;
  display_name: string;
  supported_countries: string[];

  lookupCompany(registrationNumber: string, country: string): Promise<import('./types.js').RegistryCompanyInfo | null>;

  matchAuthorizedPerson(
    user: import('./types.js').UserFrontmatter,
    companyInfo: import('./types.js').RegistryCompanyInfo,
  ): Promise<import('./types.js').VerificationEvidence | null>;

  initiateAsyncVerification?(
    org: import('./types.js').OrganizationFrontmatter,
    user: import('./types.js').UserFrontmatter,
  ): Promise<{ reference_id: string; redirect_url?: string }>;

  checkAsyncVerification?(reference_id: string): Promise<{
    status: 'pending' | 'completed' | 'failed';
    evidence?: import('./types.js').VerificationEvidence;
  }>;
}

// ─── Plugin token verification ──────────────────────────────────────

export interface PluginTokenVerifyResult {
  /** The user_principal_id from the OpenLeash user store. */
  user_principal_id: string;
}

// ─── Plugin manifest ────────────────────────────────────────────────

export interface ServerPluginManifest {
  userNavItems?: NavItem[];
  adminNavItems?: NavItem[];
  handlesRootPath?: boolean;
  replacesUserLogin?: boolean;
  staticAssetsDir?: string;
  verificationProviders?: OrgVerificationProvider[];
  extraHeadHtml?: string;
  extraBodyHtml?: string;

  /**
   * Verify an external auth token (e.g. Firebase ID token) and resolve
   * the corresponding OpenLeash user.  Return `null` for invalid tokens.
   * When provided, the owner-auth and admin-auth middlewares call this
   * instead of verifying PASETO session tokens.
   */
  verifyToken?(token: string): Promise<PluginTokenVerifyResult | null>;
}

// ─── Plugin factory ─────────────────────────────────────────────────

export type CreateServerPlugin = (
  ctx: ServerPluginContext,
  options?: Record<string, unknown>,
) => ServerPluginManifest | Promise<ServerPluginManifest>;
