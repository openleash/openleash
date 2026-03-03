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
  writeOwnerFile,
  writeSetupInviteFile,
  hashPassphrase,
} from '@openleash/core';
import type { FastifyInstance } from 'fastify';

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

    // Create a test owner (bootstrap no longer creates one)
    ownerId = crypto.randomUUID();
    writeOwnerFile(dataDir, {
      owner_principal_id: ownerId,
      principal_type: 'HUMAN',
      display_name: 'Test Owner',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    const state = readState(dataDir);
    state.owners.push({
      owner_principal_id: ownerId,
      path: `./owners/${ownerId}.md`,
    });
    writeState(dataDir, state);

    // Create a setup invite
    inviteToken = crypto.randomBytes(32).toString('base64url');
    inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);

    writeSetupInviteFile(dataDir, {
      invite_id: inviteId,
      owner_principal_id: ownerId,
      token_hash: hash,
      token_salt: salt,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    const { app: server } = createServer({ config, dataDir });
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
    expect(body.owner_principal_id).toBe(ownerId);
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
        owner_principal_id: ownerId,
        passphrase: 'my-secure-passphrase-123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.token).toMatch(/^v4\.public\./);
    expect(body.expires_at).toBeDefined();
    expect(body.owner_principal_id).toBe(ownerId);
    sessionToken = body.token;
  });

  it('POST /v1/owner/login rejects wrong passphrase', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/login',
      payload: {
        owner_principal_id: ownerId,
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
    expect(body.owner_principal_id).toBe(ownerId);
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
    expect(body.owner_principal_id).toBe(ownerId);
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
      url: '/v1/admin/owners',
      payload: { principal_type: 'HUMAN', display_name: 'Other Owner' },
    });
    const other = JSON.parse(createRes.payload);

    // Try to access the other owner's profile from the first owner's session
    const agentsRes = await app.inject({
      method: 'PUT',
      url: `/v1/owner/agents/${other.owner_principal_id}`,
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { status: 'REVOKED' },
    });
    expect(agentsRes.statusCode).toBe(404);
  });
});
