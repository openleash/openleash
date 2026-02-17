import * as crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { signRequest, verifyRequestSignature, buildSigningInput } from '../src/signing.js';
import { sha256Hex } from '../src/canonicalize.js';
import { NonceCache } from '../src/nonce-cache.js';

describe('request signing', () => {
  function makeKeypair() {
    const keypair = crypto.generateKeyPairSync('ed25519');
    const publicKeyDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
    const privateKeyDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
    return {
      publicKeyB64: (publicKeyDer as Buffer).toString('base64'),
      privateKeyB64: (privateKeyDer as Buffer).toString('base64'),
    };
  }

  it('valid signature passes', () => {
    const keys = makeKeypair();
    const bodyBytes = Buffer.from('{"test": true}');
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();

    const headers = signRequest({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodyBytes,
      privateKeyB64: keys.privateKeyB64,
    });

    const valid = verifyRequestSignature({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodySha256: headers['X-Body-Sha256'],
      signatureB64: headers['X-Signature'],
      publicKeyB64: keys.publicKeyB64,
    });

    expect(valid).toBe(true);
  });

  it('tampered body fails', () => {
    const keys = makeKeypair();
    const bodyBytes = Buffer.from('{"test": true}');
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();

    const headers = signRequest({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodyBytes,
      privateKeyB64: keys.privateKeyB64,
    });

    // Tamper with body hash
    const valid = verifyRequestSignature({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodySha256: sha256Hex(Buffer.from('{"test": false}')),
      signatureB64: headers['X-Signature'],
      publicKeyB64: keys.publicKeyB64,
    });

    expect(valid).toBe(false);
  });

  it('wrong key fails', () => {
    const keys1 = makeKeypair();
    const keys2 = makeKeypair();
    const bodyBytes = Buffer.from('{"test": true}');
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();

    const headers = signRequest({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodyBytes,
      privateKeyB64: keys1.privateKeyB64,
    });

    const valid = verifyRequestSignature({
      method: 'POST',
      path: '/v1/authorize',
      timestamp,
      nonce,
      bodySha256: headers['X-Body-Sha256'],
      signatureB64: headers['X-Signature'],
      publicKeyB64: keys2.publicKeyB64,
    });

    expect(valid).toBe(false);
  });
});

describe('nonce cache', () => {
  it('fresh nonce passes', () => {
    const cache = new NonceCache(600);
    expect(cache.check('agent1', 'nonce1')).toBe(true);
    cache.destroy();
  });

  it('repeated nonce fails', () => {
    const cache = new NonceCache(600);
    expect(cache.check('agent1', 'nonce1')).toBe(true);
    expect(cache.check('agent1', 'nonce1')).toBe(false);
    cache.destroy();
  });

  it('same nonce different agent passes', () => {
    const cache = new NonceCache(600);
    expect(cache.check('agent1', 'nonce1')).toBe(true);
    expect(cache.check('agent2', 'nonce1')).toBe(true);
    cache.destroy();
  });
});
