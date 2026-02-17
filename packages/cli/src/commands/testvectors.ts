import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { canonicalize } from 'json-canonicalize';
import { V4 } from 'paseto';
import { sha256Hex } from '@openleash/core';

export async function testvectorsCommand() {
  // Deterministic test data
  const action = {
    action_id: '00000000-0000-0000-0000-000000000001',
    action_type: 'purchase',
    requested_at: '2024-01-15T10:30:00.000Z',
    principal: { agent_id: 'test-agent' },
    subject: { principal_id: '00000000-0000-0000-0000-000000000002' },
    relying_party: { domain: 'example.com', trust_profile: 'LOW' },
    payload: {
      amount_minor: 5000,
      currency: 'USD',
      merchant_domain: 'example.com',
    },
  };

  // Canonical JSON
  const canonicalJson = canonicalize(action);
  const actionHash = sha256Hex(canonicalJson);

  // Deterministic keypair (using a fixed seed for reproducibility)
  const seed = Buffer.alloc(32, 0); // 32 zero bytes
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'), // PKCS8 Ed25519 prefix
      seed,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = crypto.createPublicKey(privateKey);

  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const privateKeyB64 = (privateKeyDer as Buffer).toString('base64');
  const publicKeyB64 = (publicKeyDer as Buffer).toString('base64');

  // Signing input
  const method = 'POST';
  const urlPath = '/v1/authorize';
  const timestamp = '2024-01-15T10:30:00.000Z';
  const nonce = '00000000-0000-0000-0000-000000000099';
  const bodyBytes = Buffer.from(JSON.stringify(action));
  const bodySha256 = sha256Hex(bodyBytes);

  const signingInput = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodySha256}`;
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
  const signatureB64 = signature.toString('base64');

  // PASETO token
  const claims = {
    iss: 'openleash',
    kid: '00000000-0000-0000-0000-000000000088',
    iat: '2024-01-15T10:30:00.000Z',
    exp: '2024-01-15T10:32:00.000Z',
    decision_id: '00000000-0000-0000-0000-000000000077',
    owner_principal_id: '00000000-0000-0000-0000-000000000002',
    agent_id: 'test-agent',
    action_type: 'purchase',
    action_hash: actionHash,
    matched_rule_id: 'test-rule',
  };

  const pasetoToken = await V4.sign(claims, privateKey, { iat: false });

  const vectors = {
    action,
    canonical_json: canonicalJson,
    action_hash: actionHash,
    public_key_b64: publicKeyB64,
    private_key_b64: privateKeyB64,
    signing_input: signingInput,
    body_sha256: bodySha256,
    signature_b64: signatureB64,
    paseto_token: pasetoToken,
    paseto_claims: claims,
  };

  // Write fixture file
  const fixtureDir = path.join(process.cwd(), 'packages', 'core', 'test', 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, 'testvectors.json');
  fs.writeFileSync(fixturePath, JSON.stringify(vectors, null, 2), 'utf-8');

  console.log('Test vectors written to packages/core/test/fixtures/testvectors.json\n');
  console.log(JSON.stringify(vectors, null, 2));
}
