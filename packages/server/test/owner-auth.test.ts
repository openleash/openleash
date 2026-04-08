import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { bootstrapState } from '../src/bootstrap.js';
import {
  readState,
  writeState,
  writeUserFile,
  writeSetupInviteFile,
  hashPassphrase,
  createFileDataStore,
} from '@openleash/core';
import type { FastifyInstance } from 'fastify';
import { createOwnerAuth } from '../src/middleware/owner-auth.js';
import { createAdminAuth } from '../src/middleware/admin-auth.js';
import type { ServerPluginManifest, OpenleashConfig, DataStore, PluginTokenVerifyResult } from '@openleash/core';

describe('owner auth', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let ownerId: string;
  let inviteId: string;
  let inviteToken: string;
  let sessionToken: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-owner-auth-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    // Create a test user (bootstrap no longer creates one)
    ownerId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: ownerId,
      display_name: 'Test Owner',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    const state = readState(dataDir);
    state.users.push({
      user_principal_id: ownerId,
      path: `./owners/${ownerId}.md`,
    });
    writeState(dataDir, state);

    // Create a setup invite
    inviteToken = crypto.randomBytes(32).toString('base64url');
    inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);

    writeSetupInviteFile(dataDir, {
      invite_id: inviteId,
      user_principal_id: ownerId,
      token_hash: hash,
      token_salt: salt,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('POST /v1/owner/setup completes setup with invite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/setup',
      payload: {
        invite_id: inviteId,
        invite_token: inviteToken,
        passphrase: 'my-secure-passphrase-123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('setup_complete');
    expect(body.user_principal_id).toBe(ownerId);
  });

  it('POST /v1/owner/setup rejects already used invite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/setup',
      payload: {
        invite_id: inviteId,
        invite_token: inviteToken,
        passphrase: 'another-passphrase',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVITE_USED');
  });

  it('POST /v1/owner/login succeeds with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/login',
      payload: {
        user_principal_id: ownerId,
        passphrase: 'my-secure-passphrase-123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.token).toMatch(/^v4\.public\./);
    expect(body.expires_at).toBeDefined();
    expect(body.user_principal_id).toBe(ownerId);
    sessionToken = body.token;
  });

  it('POST /v1/owner/login rejects wrong passphrase', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/login',
      payload: {
        user_principal_id: ownerId,
        passphrase: 'wrong-passphrase',
      },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /v1/owner/profile returns owner info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/owner/profile',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user_principal_id).toBe(ownerId);
    expect(body.display_name).toBe('Test Owner');
    // Should not expose passphrase fields
    expect(body.passphrase_hash).toBeUndefined();
    expect(body.passphrase_salt).toBeUndefined();
  });

  it('GET /v1/owner/profile rejects without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/owner/profile',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /v1/owner/agents returns empty list for new owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/owner/agents',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.agents).toBeInstanceOf(Array);
  });

  it('GET /v1/owner/policies returns owner-scoped policies', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/owner/policies',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policies).toBeInstanceOf(Array);
  });

  it('POST /v1/owner/policies creates a new policy', async () => {
    const yaml = `version: 1\ndefault: deny\nrules:\n  - id: owner_allow\n    effect: allow\n    action: read\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/policies',
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { policy_yaml: yaml },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_id).toBeDefined();
    expect(body.user_principal_id).toBe(ownerId);
  });

  it('POST /v1/owner/logout works', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/logout',
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('logged_out');
  });

  it('cross-owner scoping returns 404', async () => {
    // Create a second owner
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/users',
      payload: { display_name: 'Other Owner' },
    });
    const other = JSON.parse(createRes.payload);

    // Try to access the other owner's profile from the first owner's session
    const agentsRes = await app.inject({
      method: 'PUT',
      url: `/v1/owner/agents/${other.user_principal_id}`,
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { status: 'REVOKED' },
    });
    expect(agentsRes.statusCode).toBe(404);
  });
});

// ─── Plugin token verification ──────────────────────────────────────

describe('owner auth with plugin verifyToken', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let userId: string;
  let adminUserId: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-plugin-auth-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    // Create a regular user
    userId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: userId,
      display_name: 'Plugin User',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    // Create an admin user
    adminUserId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: adminUserId,
      display_name: 'Plugin Admin',
      status: 'ACTIVE',
      system_roles: ['admin'],
      attributes: {},
      created_at: new Date().toISOString(),
    });

    const state = readState(dataDir);
    state.users.push(
      { user_principal_id: userId, path: `./owners/${userId}.md` },
      { user_principal_id: adminUserId, path: `./owners/${adminUserId}.md` },
    );
    writeState(dataDir, state);

    // Create a plugin manifest with verifyToken that maps
    // "valid-token-<userId>" → that user
    const pluginManifest: ServerPluginManifest = {
      async verifyToken(token: string): Promise<PluginTokenVerifyResult | null> {
        const match = token.match(/^valid-token-(.+)$/);
        if (!match) return null;
        return { user_principal_id: match[1] };
      },
    };

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({
      config: { ...config, plugin: undefined },
      dataDir,
      store,
    });

    // Manually register owner/admin routes with the plugin manifest
    // We need to test the middleware directly since createServer won't
    // have a real plugin to load. Instead, create a second Fastify app
    // with the middleware wired up manually.
    const Fastify = (await import('fastify')).default;
    const testApp = Fastify({ logger: false });

    const ownerAuth = createOwnerAuth(config, store, pluginManifest);
    const adminAuth = createAdminAuth(config, store, pluginManifest);

    testApp.get('/test/owner', { preHandler: ownerAuth }, async (request) => {
      const session = (request as unknown as Record<string, unknown>).ownerSession as Record<string, unknown>;
      return { sub: session.sub, iss: session.iss, system_roles: session.system_roles };
    });

    testApp.get('/test/admin', { preHandler: adminAuth }, async (request) => {
      const session = (request as unknown as Record<string, unknown>).adminSession as Record<string, unknown>;
      return { principal_id: session.principal_id, auth_method: session.auth_method };
    });

    await testApp.ready();
    app = testApp;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('accepts a valid plugin token for owner auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/owner',
      headers: { authorization: `Bearer valid-token-${userId}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.sub).toBe(userId);
    expect(body.iss).toBe('openleash:plugin');
  });

  it('rejects an invalid plugin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/owner',
      headers: { authorization: 'Bearer garbage-token' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_SESSION');
  });

  it('rejects a token for a non-existent user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/owner',
      headers: { authorization: 'Bearer valid-token-nonexistent' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects missing token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/owner',
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('MISSING_TOKEN');
  });

  it('resolves system_roles from store for plugin-auth sessions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/owner',
      headers: { authorization: `Bearer valid-token-${adminUserId}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.sub).toBe(adminUserId);
    expect(body.system_roles).toContain('admin');
  });

  it('accepts plugin token for admin auth when user has admin role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/admin',
      headers: { authorization: `Bearer valid-token-${adminUserId}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.principal_id).toBe(adminUserId);
    expect(body.auth_method).toBe('session');
  });

  it('plugin token for admin auth falls through when user lacks admin role', async () => {
    // In self-hosted mode with localhost bypass, a non-admin plugin token
    // falls through to the localhost path and succeeds with auth_method='localhost'.
    // In hosted mode, this would return 401.
    const res = await app.inject({
      method: 'GET',
      url: '/test/admin',
      headers: { authorization: `Bearer valid-token-${userId}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.auth_method).toBe('localhost');
  });

  it('reads plugin token from openleash_session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/owner',
      headers: { cookie: `openleash_session=valid-token-${userId}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.sub).toBe(userId);
  });
});
