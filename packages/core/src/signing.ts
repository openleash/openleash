import * as crypto from 'node:crypto';
import { sha256Hex } from './canonicalize.js';

/**
 * Build the signing input string for agent request signing.
 */
export function buildSigningInput(
  method: string,
  urlPath: string,
  timestamp: string,
  nonce: string,
  bodySha256: string
): string {
  return `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodySha256}`;
}

/**
 * Sign a request using Ed25519 private key.
 */
export function signRequest(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyBytes: Buffer;
  privateKeyB64: string;
}): {
  'X-Agent-Id'?: string;
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Body-Sha256': string;
  'X-Signature': string;
} {
  const bodySha256 = sha256Hex(params.bodyBytes);
  const signingInput = buildSigningInput(
    params.method,
    params.path,
    params.timestamp,
    params.nonce,
    bodySha256
  );

  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(params.privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);

  return {
    'X-Timestamp': params.timestamp,
    'X-Nonce': params.nonce,
    'X-Body-Sha256': bodySha256,
    'X-Signature': signature.toString('base64'),
  };
}

/**
 * Verify an agent's request signature.
 */
export function verifyRequestSignature(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
  signatureB64: string;
  publicKeyB64: string;
}): boolean {
  const signingInput = buildSigningInput(
    params.method,
    params.path,
    params.timestamp,
    params.nonce,
    params.bodySha256
  );

  const publicKey = crypto.createPublicKey({
    key: Buffer.from(params.publicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const signature = Buffer.from(params.signatureB64, 'base64');
  return crypto.verify(null, Buffer.from(signingInput), publicKey, signature);
}
