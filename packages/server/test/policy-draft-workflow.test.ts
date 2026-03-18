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
  writeAgentFile,
  writeSetupInviteFile,
  readPolicyFile,
  hashPassphrase,
  sha256Hex,
  createFileDataStore,
} from '@openleash/core';
import type { FastifyInstance } from 'fastify';

describe('policy draft workflow', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let ownerId: string;
  let ownerSessionToken: string;
  let agentId: string;
  let agentPrincipalId: string;
  let agentPrivateKeyB64: string;

  function signedHeaders(method: string, urlPath: string, bodyBytes: Buffer) {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const bodySha256 = sha256Hex(bodyBytes);
    const signingInput = [method, urlPath, timestamp, nonce, bodySha256].join('\n');

    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(agentPrivateKeyB64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });

    const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);

    return {
      'X-Agent-Id': agentId,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Body-Sha256': bodySha256,
      'X-Signature': signature.toString('base64'),
    };
  }

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-policy-draft-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    // Create a test owner
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

    // Setup owner passphrase via invite
    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash: invHash, salt: invSalt } = hashPassphrase(inviteToken);
    writeSetupInviteFile(dataDir, {
      invite_id: inviteId,
      owner_principal_id: ownerId,
      token_hash: invHash,
      token_salt: invSalt,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    // Create agent
    const keypair = crypto.generateKeyPairSync('ed25519');
    const publicKeyDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
    const privateKeyDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
    agentPrivateKeyB64 = privateKeyDer.toString('base64');

    agentId = 'policy-draft-test-agent';
    agentPrincipalId = crypto.randomUUID();
    writeAgentFile(dataDir, {
      agent_principal_id: agentPrincipalId,
      agent_id: agentId,
      owner_principal_id: ownerId,
      public_key_b64: publicKeyDer.toString('base64'),
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
      revoked_at: null,
      webhook_url: 'https://policy-draft-test-agent.example.com/webhook',
      webhook_secret: 'test-webhook-secret',
      webhook_auth_token: 'test-webhook-auth-token',
    });

    // Update state with agent
    const updatedState = readState(dataDir);
    updatedState.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: agentId,
      owner_principal_id: ownerId,
      path: `./agents/${agentPrincipalId}.md`,
    });
    writeState(dataDir, updatedState);

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();

    // Complete owner setup
    await app.inject({
      method: 'POST',
      url: '/v1/owner/setup',
      payload: { invite_id: inviteId, invite_token: inviteToken, passphrase: 'test-passphrase-123' },
    });

    // Login owner
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/owner/login',
      payload: { owner_principal_id: ownerId, passphrase: 'test-passphrase-123' },
    });
    ownerSessionToken = JSON.parse(loginRes.payload).token;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const validPolicyYaml = `version: 1
default: deny
rules:
  - id: allow-read
    effect: allow
    action: "data.read"
    description: Agent needs read access to data
`;

  let policyDraftId: string;

  it('agent submits a policy draft', async () => {
    const reqBody = {
      policy_yaml: validPolicyYaml,
      applies_to_agent_principal_id: agentPrincipalId,
      justification: 'I need read access to data for analytics',
    };

    const bodyBytes = Buffer.from(JSON.stringify(reqBody));
    const headers = signedHeaders('POST', '/v1/agent/policy-drafts', bodyBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/agent/policy-drafts',
      headers: { 'content-type': 'application/json', ...headers },
      payload: reqBody,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_draft_id).toBeDefined();
    expect(body.status).toBe('PENDING');
    policyDraftId = body.policy_draft_id;
  });

  it('agent submits invalid policy YAML and gets 400', async () => {
    const reqBody = {
      policy_yaml: 'not: valid: policy: yaml',
      justification: 'test',
    };

    const bodyBytes = Buffer.from(JSON.stringify(reqBody));
    const headers = signedHeaders('POST', '/v1/agent/policy-drafts', bodyBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/agent/policy-drafts',
      headers: { 'content-type': 'application/json', ...headers },
      payload: reqBody,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_POLICY');
  });

  it('agent lists own policy drafts', async () => {
    const bodyBytes = Buffer.from('{}');
    const headers = signedHeaders('GET', '/v1/agent/policy-drafts', bodyBytes);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/agent/policy-drafts',
      headers: { 'content-type': 'application/json', ...headers },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_drafts.length).toBeGreaterThan(0);
    const draft = body.policy_drafts.find(
      (d: { policy_draft_id: string }) => d.policy_draft_id === policyDraftId
    );
    expect(draft).toBeDefined();
    expect(draft.status).toBe('PENDING');
  });

  it('agent gets policy draft by id', async () => {
    const bodyBytes = Buffer.from('{}');
    const urlPath = `/v1/agent/policy-drafts/${policyDraftId}`;
    const headers = signedHeaders('GET', urlPath, bodyBytes);

    const res = await app.inject({
      method: 'GET',
      url: urlPath,
      headers: { 'content-type': 'application/json', ...headers },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_draft_id).toBe(policyDraftId);
    expect(body.policy_yaml).toContain('data.read');
    expect(body.justification).toBe('I need read access to data for analytics');
  });

  it('owner sees pending policy draft', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/owner/policy-drafts?status=PENDING',
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_drafts.length).toBeGreaterThan(0);
    const draft = body.policy_drafts.find(
      (d: { policy_draft_id: string }) => d.policy_draft_id === policyDraftId
    );
    expect(draft).toBeDefined();
    expect(draft.status).toBe('PENDING');
    expect(draft.policy_yaml).toContain('data.read');
  });

  it('owner gets policy draft by id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/owner/policy-drafts/${policyDraftId}`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.policy_draft_id).toBe(policyDraftId);
    expect(body.agent_id).toBe(agentId);
    expect(body.justification).toBe('I need read access to data for analytics');
  });

  let createdPolicyId: string;

  it('owner approves policy draft and policy is created', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/owner/policy-drafts/${policyDraftId}/approve`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('APPROVED');
    expect(body.policy_id).toBeDefined();
    expect(body.applies_to_agent_principal_id).toBe(agentPrincipalId);
    createdPolicyId = body.policy_id;

    // Verify the policy was actually created
    const policyRes = await app.inject({
      method: 'GET',
      url: `/v1/owner/policies/${createdPolicyId}`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(policyRes.statusCode).toBe(200);
    const policyBody = JSON.parse(policyRes.payload);
    expect(policyBody.policy_yaml).toContain('data.read');
    expect(policyBody.applies_to_agent_principal_id).toBe(agentPrincipalId);
  });

  it('cannot approve already-approved draft', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/owner/policy-drafts/${policyDraftId}/approve`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_STATUS');
  });

  it('agent sees approved status and resulting policy id', async () => {
    const bodyBytes = Buffer.from('{}');
    const urlPath = `/v1/agent/policy-drafts/${policyDraftId}`;
    const headers = signedHeaders('GET', urlPath, bodyBytes);

    const res = await app.inject({
      method: 'GET',
      url: urlPath,
      headers: { 'content-type': 'application/json', ...headers },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('APPROVED');
    expect(body.resulting_policy_id).toBe(createdPolicyId);
  });

  it('denial flow works', async () => {
    // Create another draft
    const reqBody = {
      policy_yaml: validPolicyYaml,
      justification: 'Another request',
    };

    const bodyBytes = Buffer.from(JSON.stringify(reqBody));
    const headers = signedHeaders('POST', '/v1/agent/policy-drafts', bodyBytes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/agent/policy-drafts',
      headers: { 'content-type': 'application/json', ...headers },
      payload: reqBody,
    });
    const newDraftId = JSON.parse(createRes.payload).policy_draft_id;

    // Owner denies
    const denyRes = await app.inject({
      method: 'POST',
      url: `/v1/owner/policy-drafts/${newDraftId}/deny`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
      payload: { reason: 'Not needed at this time' },
    });
    expect(denyRes.statusCode).toBe(200);
    const denyBody = JSON.parse(denyRes.payload);
    expect(denyBody.status).toBe('DENIED');

    // Agent sees denial with reason
    const getBodyBytes = Buffer.from('{}');
    const getUrl = `/v1/agent/policy-drafts/${newDraftId}`;
    const getHeaders = signedHeaders('GET', getUrl, getBodyBytes);

    const getRes = await app.inject({
      method: 'GET',
      url: getUrl,
      headers: { 'content-type': 'application/json', ...getHeaders },
    });
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.status).toBe('DENIED');
    expect(getBody.denial_reason).toBe('Not needed at this time');
  });

  it('cannot deny already-denied draft', async () => {
    // Create and deny a draft
    const reqBody = {
      policy_yaml: validPolicyYaml,
      justification: 'Will be denied twice',
    };

    const bodyBytes = Buffer.from(JSON.stringify(reqBody));
    const headers = signedHeaders('POST', '/v1/agent/policy-drafts', bodyBytes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/agent/policy-drafts',
      headers: { 'content-type': 'application/json', ...headers },
      payload: reqBody,
    });
    const draftId = JSON.parse(createRes.payload).policy_draft_id;

    // First deny
    await app.inject({
      method: 'POST',
      url: `/v1/owner/policy-drafts/${draftId}/deny`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
      payload: { reason: 'No' },
    });

    // Second deny should fail
    const res = await app.inject({
      method: 'POST',
      url: `/v1/owner/policy-drafts/${draftId}/deny`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
      payload: { reason: 'No again' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe('INVALID_STATUS');
  });
});
