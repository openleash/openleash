import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { bootstrapState } from '../src/bootstrap.js';
import { readState, writeState, writePolicyFile } from '@openleash/core';
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

    // Create a test policy
    policyId = crypto.randomUUID();
    const policyYaml = `version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: read\n`;
    writePolicyFile(dataDir, policyId, policyYaml);

    const state = readState(dataDir);
    const ownerPrincipalId = state.owners[0].owner_principal_id;
    state.policies.push({
      policy_id: policyId,
      owner_principal_id: ownerPrincipalId,
      applies_to_agent_principal_id: null,
      path: `./policies/${policyId}.yaml`,
    });
    state.bindings.push({
      owner_principal_id: ownerPrincipalId,
      policy_id: policyId,
      applies_to_agent_principal_id: null,
    });
    writeState(dataDir, state);

    const { app: server } = createServer({ config, dataDir });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /gui redirects to /gui/dashboard', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/gui/dashboard');
  });

  it('GET /gui/dashboard returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Dashboard');
    expect(res.payload).toContain('OpenLeash');
  });

  it('GET /gui/owners returns HTML with owner table', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/owners' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Owners');
  });

  it('GET /gui/agents returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/agents' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Agents');
  });

  it('GET /gui/policies returns HTML with policy list', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/policies' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Policies');
    expect(res.payload).toContain(policyId.slice(0, 8));
  });

  it('GET /gui/policies/:policyId returns policy editor', async () => {
    const res = await app.inject({ method: 'GET', url: `/gui/policies/${policyId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Edit Policy');
    expect(res.payload).toContain('allow_read');
  });

  it('GET /gui/policies/:invalid returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/gui/policies/${crypto.randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /gui/config returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/config' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toContain('Configuration');
  });

  it('GET /gui/audit returns HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/audit' });
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

    const { app: server } = createServer({ config, dataDir });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /gui returns 404 when GUI disabled', async () => {
    const res = await app.inject({ method: 'GET', url: '/gui/dashboard' });
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

    policyId = crypto.randomUUID();
    const policyYaml = `version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: read\n`;
    writePolicyFile(dataDir, policyId, policyYaml);

    const state = readState(dataDir);
    const ownerPrincipalId = state.owners[0].owner_principal_id;
    state.policies.push({
      policy_id: policyId,
      owner_principal_id: ownerPrincipalId,
      applies_to_agent_principal_id: null,
      path: `./policies/${policyId}.yaml`,
    });
    writeState(dataDir, state);

    const { app: server } = createServer({ config, dataDir });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /v1/admin/owners returns owners list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/owners' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.owners).toBeInstanceOf(Array);
    expect(body.owners.length).toBeGreaterThan(0);
    expect(body.owners[0].owner_principal_id).toBeDefined();
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

  it('PUT /v1/admin/policies/:policyId updates policy', async () => {
    const newYaml = `version: 1\ndefault: deny\nrules:\n  - id: allow_write\n    effect: allow\n    action: write\n`;
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/policies/${policyId}`,
      payload: { policy_yaml: newYaml },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('updated');

    // Verify file was actually updated
    const getRes = await app.inject({ method: 'GET', url: `/v1/admin/policies/${policyId}` });
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.policy_yaml).toContain('allow_write');
  });

  it('PUT /v1/admin/policies/:policyId rejects invalid YAML', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/policies/${policyId}`,
      payload: { policy_yaml: 'not: valid\npolicy: yaml\n' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_POLICY');
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
    expect(body.counts.owners).toBeGreaterThanOrEqual(1);
    expect(body.version).toBe(1);
    expect(body.active_kid).toBeDefined();
  });
});
