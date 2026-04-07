import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { bootstrapState } from '../src/bootstrap.js';
import { readState, writeState, writeUserFile, writePolicyFile, createFileDataStore } from '@openleash/core';
import type { FastifyInstance } from 'fastify';

describe('GUI routes', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let policyId: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-gui-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    // Create a test user (bootstrap no longer creates one)
    const userPrincipalId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: userPrincipalId,
      display_name: 'Test Owner',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    const state = readState(dataDir);
    state.users.push({
      user_principal_id: userPrincipalId,
      path: `./owners/${userPrincipalId}.md`,
    });

    // Create a test policy
    policyId = crypto.randomUUID();
    const policyYaml = `version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: read\n`;
    writePolicyFile(dataDir, policyId, policyYaml);

    state.policies.push({
      policy_id: policyId,
      owner_type: 'user',
      owner_id: userPrincipalId,
      applies_to_agent_principal_id: null,
      name: null,
      description: null,
      path: `./policies/${policyId}.yaml`,
    });
    state.bindings.push({
      owner_type: 'user',
      owner_id: userPrincipalId,
      policy_id: policyId,
      applies_to_agent_principal_id: null,
    });
    writeState(dataDir, state);

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /gui redirects to /gui/dashboard when owners exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/gui/dashboard');
  });

  it('GET /gui/admin/dashboard returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Dashboard');
    expect(res.payload).toContain('OpenLeash');
  });

  it('GET /gui/admin/owners redirects to /gui/admin/users', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/owners' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/gui/admin/users');
  });

  it('GET /gui/admin/users returns HTML with user table', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/users' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Owners');
  });

  it('GET /gui/admin/organizations returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/organizations' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Organizations');
  });

  it('GET /gui/admin/agents returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/agents' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Agents');
  });

  it('GET /gui/admin/policies returns HTML with policy list', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/policies' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Policies');
    expect(res.payload).toContain(policyId.slice(0, 8));
  });

  it('GET /gui/admin/policies/:policyId returns policy editor', async () => {
    const res = await app.inject({ method: 'GET', url: `/gui/admin/policies/${policyId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('View Policy');
    expect(res.payload).toContain('allow_read');
  });

  it('GET /gui/admin/policies/:invalid returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/gui/admin/policies/${crypto.randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /gui/admin/config returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/config' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Configuration');
  });

  it('GET /gui/admin/audit returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/audit' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Audit Log');
  });
});

describe('GUI disabled', () => {
  let app: FastifyInstance;
  let rootDir: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-gui-disabled-'));
    const dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);
    config.gui = { enabled: false };

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /gui returns 404 when GUI disabled', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/admin/dashboard' });
    expect(res.statusCode).toBe(404);
  });
});

describe('admin API - new endpoints', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let policyId: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-admin-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    // Create a test user (bootstrap no longer creates one)
    const userPrincipalId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: userPrincipalId,
      display_name: 'Test Owner',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    policyId = crypto.randomUUID();
    const policyYaml = `version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: read\n`;
    writePolicyFile(dataDir, policyId, policyYaml);

    const state = readState(dataDir);
    state.users.push({
      user_principal_id: userPrincipalId,
      path: `./owners/${userPrincipalId}.md`,
    });
    state.policies.push({
      policy_id: policyId,
      owner_type: 'user',
      owner_id: userPrincipalId,
      applies_to_agent_principal_id: null,
      name: null,
      description: null,
      path: `./policies/${policyId}.yaml`,
    });
    writeState(dataDir, state);

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /v1/admin/users returns users list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/users' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.users).toBeInstanceOf(Array);
    expect(body.users.length).toBeGreaterThan(0);
    expect(body.users[0].user_principal_id).toBeDefined();
  });

  it('GET /v1/admin/agents returns agents list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/agents' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.agents).toBeInstanceOf(Array);
  });

  it('GET /v1/admin/policies returns policies with YAML', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/policies' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policies).toBeInstanceOf(Array);
    const policy = body.policies.find((p: { policy_id: string }) => p.policy_id === policyId);
    expect(policy).toBeDefined();
    expect(policy.policy_yaml).toContain('allow_read');
  });

  it('GET /v1/admin/policies/:policyId returns single policy', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/admin/policies/${policyId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_id).toBe(policyId);
    expect(body.policy_yaml).toContain('allow_read');
  });

  it('GET /v1/admin/policies/:invalid returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/admin/policies/${crypto.randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/admin/config returns sanitized config', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/config' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.server.bind_address).toBeDefined();
    expect(body.admin.token_set).toBeDefined();
    expect(body.admin.token).toBeUndefined();
  });

  it('GET /v1/admin/state returns state summary', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/state' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.counts).toBeDefined();
    expect(body.counts.users).toBeGreaterThanOrEqual(1);
    expect(body.version).toBe(2);
    expect(body.active_kid).toBeDefined();
  });
});

describe('admin API - user write endpoints', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let existingUserId: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-admin-write-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    existingUserId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: existingUserId,
      display_name: 'Existing Owner',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    const state = readState(dataDir);
    state.users.push({
      user_principal_id: existingUserId,
      path: `./users/${existingUserId}.md`,
    });
    writeState(dataDir, state);

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('POST /v1/admin/users creates a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/users',
      payload: { display_name: 'New User' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user_principal_id).toBeDefined();
    expect(body.display_name).toBe('New User');
    expect(body.status).toBe('ACTIVE');
  });

  it('POST /v1/admin/users/:userId/setup-invite creates invite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${existingUserId}/setup-invite`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.invite_id).toBeDefined();
    expect(body.invite_token).toBeDefined();
    expect(body.expires_at).toBeDefined();
  });

  it('POST /v1/admin/users/:userId/setup-invite returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${crypto.randomUUID()}/setup-invite`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /v1/admin/users/:userId/disable-totp returns 400 when not enabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${existingUserId}/disable-totp`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('TOTP_NOT_ENABLED');
  });

  it('POST /v1/admin/users/:userId/disable-totp returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${crypto.randomUUID()}/disable-totp`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/admin/users/:userId/roles returns roles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${existingUserId}/roles`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user_principal_id).toBe(existingUserId);
    expect(body.system_roles).toBeInstanceOf(Array);
  });

  it('PUT /v1/admin/users/:userId/roles grants admin role', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/users/${existingUserId}/roles`,
      payload: { system_roles: ['admin'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.system_roles).toContain('admin');

    // Verify the role persisted
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${existingUserId}/roles`,
    });
    const getRoles = JSON.parse(getRes.payload);
    expect(getRoles.system_roles).toContain('admin');
  });

  it('PUT /v1/admin/users/:userId/roles rejects invalid role', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/users/${existingUserId}/roles`,
      payload: { system_roles: ['superuser'] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_ROLE');
  });

  it('PUT /v1/admin/users/:userId/roles returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/users/${crypto.randomUUID()}/roles`,
      payload: { system_roles: ['admin'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /v1/admin/users/:userId deletes user', async () => {
    // Create a user to delete
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/users',
      payload: { display_name: 'To Delete' },
    });
    const { user_principal_id: deleteId } = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/users/${deleteId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('deleted');

    // Verify user is gone from state
    const listRes = await app.inject({ method: 'GET', url: '/v1/admin/users' });
    const list = JSON.parse(listRes.payload);
    expect(list.users.find((u: { user_principal_id: string }) => u.user_principal_id === deleteId)).toBeUndefined();
  });

  it('DELETE /v1/admin/users/:userId returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/users/${crypto.randomUUID()}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /v1/admin/users/:userId/agent-invite creates agent invite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${existingUserId}/agent-invite`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.invite_id).toBeDefined();
    expect(body.invite_token).toBeDefined();
    expect(body.expires_at).toBeDefined();
  });

  it('POST /v1/admin/users/:userId/agent-invite returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${crypto.randomUUID()}/agent-invite`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('initial setup flow', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-setup-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /gui redirects to /gui/setup when no owners', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/gui/setup');
  });

  it('GET /gui/setup returns HTML when no owners', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/setup' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Initial Setup');
  });

  let createdOwnerId: string;

  it('POST /v1/initial-setup creates first owner with passphrase', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/initial-setup',
      payload: {
        display_name: 'Setup Owner',
        passphrase: 'test-passphrase-123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('setup_complete');
    expect(body.user_principal_id).toBeDefined();
    expect(body.display_name).toBe('Setup Owner');
    createdOwnerId = body.user_principal_id;
  });

  it('POST /v1/initial-setup returns 403 when owners already exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/initial-setup',
      payload: {
        display_name: 'Another Owner',
        passphrase: 'another-passphrase-123',
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('SETUP_ALREADY_COMPLETED');
  });

  it('GET /gui/setup redirects to dashboard after setup', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/setup' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/gui/dashboard');
  });

  it('GET /gui redirects to /gui/dashboard (owner) after setup', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/gui/dashboard');
  });

  it('owner can log in with passphrase set during initial setup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/login',
      payload: {
        user_principal_id: createdOwnerId,
        passphrase: 'test-passphrase-123',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.token).toMatch(/^v4\.public\./);
    expect(body.user_principal_id).toBe(createdOwnerId);
  });
});
