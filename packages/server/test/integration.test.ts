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
  sha256Hex,
  signRequest,
} from '@openleash/core';
import type { FastifyInstance } from 'fastify';

describe('server integration', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let agentId: string;
  let ownerPrincipalId: string;
  let agentPrincipalId: string;
  let publicKeyB64: string;
  let privateKeyB64: string;

  beforeAll(async () => {
    // Create temp directory
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-test-'));
    dataDir = path.join(rootDir, 'data');

    // Bootstrap
    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    // Create a test agent
    const keypair = crypto.generateKeyPairSync('ed25519');
    const pubDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
    const privDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
    publicKeyB64 = (pubDer as Buffer).toString('base64');
    privateKeyB64 = (privDer as Buffer).toString('base64');

    agentId = 'test-agent';
    agentPrincipalId = crypto.randomUUID();

    const state = readState(dataDir);
    ownerPrincipalId = state.owners[0].owner_principal_id;

    writeAgentFile(dataDir, {
      agent_principal_id: agentPrincipalId,
      agent_id: agentId,
      owner_principal_id: ownerPrincipalId,
      public_key_b64: publicKeyB64,
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
      revoked_at: null,
    });

    state.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: agentId,
      owner_principal_id: ownerPrincipalId,
      path: `./agents/${agentPrincipalId}.md`,
    });

    // Create a test policy
    const policyId = crypto.randomUUID();
    const policyYaml = `version: 1
default: deny
rules:
  - id: allow_purchase
    effect: allow
    action: purchase
    constraints:
      amount_max: 50000
    proof:
      required: true
  - id: deny_communication
    effect: deny
    action: "communication.*"
`;
    writePolicyFile(dataDir, policyId, policyYaml);

    state.policies.push({
      policy_id: policyId,
      owner_principal_id: ownerPrincipalId,
      applies_to_agent_principal_id: null,
      path: `./policies/${policyId}.yaml`,
    });
    // Replace existing bindings so our test policy is used
    state.bindings = [{
      owner_principal_id: ownerPrincipalId,
      policy_id: policyId,
      applies_to_agent_principal_id: null,
    }];

    writeState(dataDir, state);

    const { app: server } = createServer({ config, dataDir });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('GET /v1/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
  });

  it('GET /v1/public-keys returns keys', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/public-keys' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.keys).toBeInstanceOf(Array);
    expect(body.keys.length).toBeGreaterThan(0);
    expect(body.keys[0].kty).toBe('OKP');
    expect(body.keys[0].alg).toBe('EdDSA');
  });

  it('registration challenge -> register -> agent stored', async () => {
    const newAgentId = 'reg-test-agent';
    const keypair = crypto.generateKeyPairSync('ed25519');
    const pubDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
    const privKey = keypair.privateKey;
    const newPubKeyB64 = (pubDer as Buffer).toString('base64');

    // Step 1: Get challenge
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/agents/registration-challenge',
      payload: {
        agent_id: newAgentId,
        agent_pubkey_b64: newPubKeyB64,
        owner_principal_id: ownerPrincipalId,
      },
    });
    expect(challengeRes.statusCode).toBe(200);
    const challenge = JSON.parse(challengeRes.payload);
    expect(challenge.challenge_id).toBeDefined();

    // Step 2: Sign and register
    const challengeBytes = Buffer.from(challenge.challenge_b64, 'base64');
    const signature = crypto.sign(null, challengeBytes, privKey);

    const registerRes = await app.inject({
      method: 'POST',
      url: '/v1/agents/register',
      payload: {
        challenge_id: challenge.challenge_id,
        agent_id: newAgentId,
        agent_pubkey_b64: newPubKeyB64,
        signature_b64: signature.toString('base64'),
        owner_principal_id: ownerPrincipalId,
      },
    });
    expect(registerRes.statusCode).toBe(200);
    const regResult = JSON.parse(registerRes.payload);
    expect(regResult.agent_id).toBe(newAgentId);
    expect(regResult.status).toBe('ACTIVE');

    // Verify agent is in state
    const state = readState(dataDir);
    const found = state.agents.find((a) => a.agent_id === newAgentId);
    expect(found).toBeDefined();
  });

  it('authorize with signed headers works', async () => {
    const action = {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerPrincipalId },
      relying_party: { domain: 'example.com', trust_profile: 'LOW' },
      payload: { amount_minor: 5000, currency: 'USD', merchant_domain: 'example.com' },
    };

    const bodyBytes = Buffer.from(JSON.stringify(action));
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();

    const headers = signRequest({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodyBytes,
      privateKeyB64,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/authorize',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': agentId,
        'x-timestamp': headers['X-Timestamp'],
        'x-nonce': headers['X-Nonce'],
        'x-body-sha256': headers['X-Body-Sha256'],
        'x-signature': headers['X-Signature'],
      },
      payload: action,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result).toBe('ALLOW');
    expect(body.matched_rule_id).toBe('allow_purchase');
    expect(body.action_hash).toBeDefined();
    expect(body.proof_token).toBeDefined(); // proof required by rule
  });

  it('verify-proof returns valid for issued token', async () => {
    // First authorize to get a token
    const action = {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerPrincipalId },
      relying_party: { domain: 'example.com', trust_profile: 'LOW' },
      payload: { amount_minor: 3000, currency: 'USD', merchant_domain: 'example.com' },
    };

    const bodyBytes = Buffer.from(JSON.stringify(action));
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();

    const headers = signRequest({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodyBytes,
      privateKeyB64,
    });

    const authRes = await app.inject({
      method: 'POST',
      url: '/v1/authorize',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': agentId,
        'x-timestamp': headers['X-Timestamp'],
        'x-nonce': headers['X-Nonce'],
        'x-body-sha256': headers['X-Body-Sha256'],
        'x-signature': headers['X-Signature'],
      },
      payload: action,
    });

    const authBody = JSON.parse(authRes.payload);
    expect(authBody.proof_token).toBeDefined();

    // Verify the proof
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/verify-proof',
      payload: {
        token: authBody.proof_token,
        expected_agent_id: agentId,
      },
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.payload);
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.claims.agent_id).toBe(agentId);
  });

  it('authorize without signed headers fails', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/authorize',
      payload: {
        action_id: crypto.randomUUID(),
        action_type: 'purchase',
        requested_at: new Date().toISOString(),
        principal: { agent_id: 'test' },
        subject: { principal_id: ownerPrincipalId },
        payload: {},
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
