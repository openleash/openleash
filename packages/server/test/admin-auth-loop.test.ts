/**
 * Regression: in hosted mode, admin-auth used to redirect any GUI request
 * without admin role to /gui/login. The hosted-gui landing page auto-renews
 * the session (Firebase) and bounces straight back to the original URL,
 * producing an infinite redirect loop for non-admin users who tried to open
 * /gui/admin/*.
 *
 * The middleware now distinguishes "authenticated but lacks admin role"
 * (returns 403, never redirects) from "no session at all" (302 to login for
 * browser navigations, 401 JSON for API clients).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { bootstrapState } from '../src/bootstrap.js';
import {
  createFileDataStore,
  hashPassphrase,
  writeUserFile,
  writeSetupInviteFile,
  readState,
  writeState,
} from '@openleash/core';
import type { DataStore } from '@openleash/core';
import type { FastifyInstance } from 'fastify';

describe('admin-auth — no redirect loop for non-admin session', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let store: DataStore;
  let nonAdminToken: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-adminauth-loop-'));
    const dataDir = path.join(rootDir, 'data');
    bootstrapState(rootDir);
    // Disable localhost admin bypass so loopback test injections don't get a
    // free admin grant from Path 3 — the production loop happens in hosted
    // mode where there is no localhost bypass at all.
    fs.writeFileSync(
      path.join(rootDir, 'config.yaml'),
      'admin:\n  mode: token\n  token: ""\n',
    );
    const config = loadConfig(rootDir);
    store = createFileDataStore(dataDir);

    // Create a non-admin user (no system_roles set)
    const userId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: userId,
      display_name: 'Regular User',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });
    const state = readState(dataDir);
    state.users.push({ user_principal_id: userId, path: `./owners/${userId}.md` });
    writeState(dataDir, state);

    // Seed an invite, complete setup, then log in to obtain a real session token
    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    writeSetupInviteFile(dataDir, {
      invite_id: inviteId,
      user_principal_id: userId,
      token_hash: hash,
      token_salt: salt,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/v1/owner/setup',
      payload: { invite_id: inviteId, invite_token: inviteToken, passphrase: 'a-passphrase-123!' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/owner/login',
      payload: { user_principal_id: userId, passphrase: 'a-passphrase-123!' },
    });
    nonAdminToken = (loginRes.json() as { token: string }).token;
    expect(nonAdminToken).toMatch(/^v4\.public\./);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('non-admin browser nav to /gui/admin/dashboard returns 403, not a login redirect', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gui/admin/dashboard',
      headers: {
        cookie: `openleash_session=${nonAdminToken}`,
        accept: 'text/html,application/xhtml+xml',
      },
    });
    // The critical assertion: anything other than 403 here re-enables the loop.
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.payload).toMatch(/admin/i);
  });

  it('non-admin API client with Bearer + Accept: json returns JSON 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gui/admin/dashboard',
      headers: {
        authorization: `Bearer ${nonAdminToken}`,
        accept: 'application/json',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ADMIN_REQUIRED');
  });

  it('no-auth browser nav still redirects to login (unchanged behavior)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gui/admin/dashboard',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/gui\/login\?returnTo=/);
  });

  it('no-auth API client gets JSON 401, not an HTML redirect', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/gui/admin/dashboard',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
