import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { canonicalize } from 'json-canonicalize';
import { V4 } from 'paseto';
import { sha256Hex } from '../src/canonicalize.js';
import { verifyRequestSignature, buildSigningInput } from '../src/signing.js';

const fixturePath = path.join(__dirname, 'fixtures', 'testvectors.json');
const vectors = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

describe('testvectors', () => {
  it('canonical JSON matches json-canonicalize output', () => {
    const canonical = canonicalize(vectors.action);
    expect(canonical).toBe(vectors.canonical_json);
  });

  it('action_hash matches SHA256 of canonical JSON', () => {
    const hash = sha256Hex(vectors.canonical_json);
    expect(hash).toBe(vectors.action_hash);
  });

  it('body_sha256 matches SHA256 of JSON.stringify(action)', () => {
    const bodyBytes = Buffer.from(JSON.stringify(vectors.action));
    const hash = sha256Hex(bodyBytes);
    expect(hash).toBe(vectors.body_sha256);
  });

  it('signing_input format is correct', () => {
    const parts = vectors.signing_input.split('\n');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('POST');
    expect(parts[1]).toBe('/v1/authorize');
    expect(parts[4]).toBe(vectors.body_sha256);

    const rebuilt = buildSigningInput(parts[0], parts[1], parts[2], parts[3], parts[4]);
    expect(rebuilt).toBe(vectors.signing_input);
  });

  it('Ed25519 signature verifies against the public key', () => {
    const valid = verifyRequestSignature({
      method: 'POST',
      path: '/v1/authorize',
      timestamp: '2024-01-15T10:30:00.000Z',
      nonce: '00000000-0000-0000-0000-000000000099',
      bodySha256: vectors.body_sha256,
      signatureB64: vectors.signature_b64,
      publicKeyB64: vectors.public_key_b64,
    });
    expect(valid).toBe(true);
  });

  it('Ed25519 signature fails with wrong data', () => {
    const valid = verifyRequestSignature({
      method: 'POST',
      path: '/v1/authorize',
      timestamp: '2024-01-15T10:30:00.000Z',
      nonce: '00000000-0000-0000-0000-000000000099',
      bodySha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signatureB64: vectors.signature_b64,
      publicKeyB64: vectors.public_key_b64,
    });
    expect(valid).toBe(false);
  });

  it('PASETO token verifies and contains expected claims', async () => {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(vectors.public_key_b64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    // V4.verify checks the signature; we need to pass clockTolerance
    // since the token's exp is in the past (2024-01-15)
    const payload = await V4.verify(vectors.paseto_token, publicKey, {
      clockTolerance: '1000 days',
    });

    expect(payload.iss).toBe('openleash');
    expect(payload.kid).toBe(vectors.paseto_claims.kid);
    expect(payload.iat).toBe(vectors.paseto_claims.iat);
    expect(payload.exp).toBe(vectors.paseto_claims.exp);
    expect(payload.agent_id).toBe(vectors.paseto_claims.agent_id);
    expect(payload.action_type).toBe(vectors.paseto_claims.action_type);
    expect(payload.action_hash).toBe(vectors.paseto_claims.action_hash);
    expect(payload.matched_rule_id).toBe(vectors.paseto_claims.matched_rule_id);
  });
});
