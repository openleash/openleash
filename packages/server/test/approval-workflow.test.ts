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
  writeAgentFile,
  writePolicyFile,
  writeSetupInviteFile,
  hashPassphrase,
  signRequest,
  sha256Hex,
} from '@openleash/core';
import type { FastifyInstance } from 'fastify';

describe('approval workflow', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let ownerId: string;
  let ownerSessionToken: string;
  let agentId: string;
  let agentPrincipalId: string;
  let agentPrivateKeyB64: string;
  let policyId: string;

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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-approval-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    const state = readState(dataDir);
    ownerId = state.owners[0].owner_principal_id;

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

    agentId = 'approval-test-agent';
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
    });

    // Create policy with HUMAN_APPROVAL obligation
    policyId = crypto.randomUUID();
    const policyYaml = `version: 1
default: deny
rules:
  - id: require_approval
    effect: allow
    action: purchase
    obligations:
      - type: HUMAN_APPROVAL
`;
    writePolicyFile(dataDir, policyId, policyYaml);

    // Update state with agent and policy
    const updatedState = readState(dataDir);
    updatedState.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: agentId,
      owner_principal_id: ownerId,
      path: `./agents/${agentPrincipalId}.md`,
    });
    updatedState.policies.push({
      policy_id: policyId,
      owner_principal_id: ownerId,
      applies_to_agent_principal_id: agentPrincipalId,
      path: `./policies/${policyId}.yaml`,
    });
    // Put agent-specific binding FIRST so it takes precedence over the default deny policy
    updatedState.bindings.unshift({
      owner_principal_id: ownerId,
      policy_id: policyId,
      applies_to_agent_principal_id: agentPrincipalId,
    });
    writeState(dataDir, updatedState);

    const { app: server } = createServer({ config, dataDir });
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

  it('agent gets REQUIRE_APPROVAL from policy with HUMAN_APPROVAL obligation', async () => {
    const action = {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerId },
      payload: { amount: 500 },
    };

    const bodyBytes = Buffer.from(JSON.stringify(action));
    const headers = signedHeaders('POST', '/v1/authorize', bodyBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/authorize',
      headers: { 'content-type': 'application/json', ...headers },
      payload: action,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result).toBe('REQUIRE_APPROVAL');
  });

  let approvalRequestId: string;
  let approvedAction: Record<string, unknown>;

  it('agent creates approval request', async () => {
    const action = {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerId },
      payload: { amount: 500 },
    };
    approvedAction = action;

    const reqBody = {
      decision_id: crypto.randomUUID(),
      action,
      justification: 'Need to buy supplies',
    };

    const bodyBytes = Buffer.from(JSON.stringify(reqBody));
    const headers = signedHeaders('POST', '/v1/agent/approval-requests', bodyBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/agent/approval-requests',
      headers: { 'content-type': 'application/json', ...headers },
      payload: reqBody,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.approval_request_id).toBeDefined();
    expect(body.status).toBe('PENDING');
    approvalRequestId = body.approval_request_id;
  });

  it('owner sees pending approval request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/owner/approval-requests?status=PENDING',
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.approval_requests.length).toBeGreaterThan(0);
    const req = body.approval_requests.find(
      (r: { approval_request_id: string }) => r.approval_request_id === approvalRequestId
    );
    expect(req).toBeDefined();
    expect(req.status).toBe('PENDING');
  });

  let approvalToken: string;

  it('owner approves and gets approval token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/owner/approval-requests/${approvalRequestId}/approve`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('APPROVED');
    expect(body.approval_token).toMatch(/^v4\.public\./);
    approvalToken = body.approval_token;
  });

  it('agent polls and gets approval token', async () => {
    const bodyBytes = Buffer.from('{}');
    const urlPath = `/v1/agent/approval-requests/${approvalRequestId}`;
    const headers = signedHeaders('GET', urlPath, bodyBytes);

    const res = await app.inject({
      method: 'GET',
      url: urlPath,
      headers: { 'content-type': 'application/json', ...headers },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('APPROVED');
    expect(body.approval_token).toBeDefined();
  });

  it('agent re-authorizes with approval token and gets proof', async () => {
    const bodyWithToken = { ...approvedAction, approval_token: approvalToken };
    const bodyBytes = Buffer.from(JSON.stringify(bodyWithToken));
    const headers = signedHeaders('POST', '/v1/authorize', bodyBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/authorize',
      headers: { 'content-type': 'application/json', ...headers },
      payload: bodyWithToken,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result).toBe('ALLOW');
    expect(body.proof_token).toMatch(/^v4\.public\./);
    expect(body.reason).toBe('Approved by owner');
  });

  it('second use of same approval token is rejected', async () => {
    const bodyWithToken = { ...approvedAction, approval_token: approvalToken };
    const bodyBytes = Buffer.from(JSON.stringify(bodyWithToken));
    const headers = signedHeaders('POST', '/v1/authorize', bodyBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/authorize',
      headers: { 'content-type': 'application/json', ...headers },
      payload: bodyWithToken,
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('APPROVAL_TOKEN_CONSUMED');
  });

  it('denial flow works', async () => {
    // Create another approval request
    const action = {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerId },
      payload: { amount: 1000 },
    };

    const reqBody = {
      decision_id: crypto.randomUUID(),
      action,
      justification: 'Too expensive',
    };

    const bodyBytes = Buffer.from(JSON.stringify(reqBody));
    const headers = signedHeaders('POST', '/v1/agent/approval-requests', bodyBytes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/agent/approval-requests',
      headers: { 'content-type': 'application/json', ...headers },
      payload: reqBody,
    });
    const newReqId = JSON.parse(createRes.payload).approval_request_id;

    // Owner denies
    const denyRes = await app.inject({
      method: 'POST',
      url: `/v1/owner/approval-requests/${newReqId}/deny`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
      payload: { reason: 'Amount too high' },
    });
    expect(denyRes.statusCode).toBe(200);
    const denyBody = JSON.parse(denyRes.payload);
    expect(denyBody.status).toBe('DENIED');

    // Agent sees denial
    const getBodyBytes = Buffer.from('{}');
    const getUrl = `/v1/agent/approval-requests/${newReqId}`;
    const getHeaders = signedHeaders('GET', getUrl, getBodyBytes);

    const getRes = await app.inject({
      method: 'GET',
      url: getUrl,
      headers: { 'content-type': 'application/json', ...getHeaders },
    });
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.status).toBe('DENIED');
    expect(getBody.denial_reason).toBe('Amount too high');
  });
});
