import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ServerKeyFile } from './types.js';

export function generateSigningKey(): ServerKeyFile {
  const kid = crypto.randomUUID();
  const keypair = crypto.generateKeyPairSync('ed25519');

  const publicKeyDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
  const privateKeyDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });

  return {
    kid,
    public_key_b64: publicKeyDer.toString('base64'),
    private_key_b64: privateKeyDer.toString('base64'),
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
}

export function writeKeyFile(dataDir: string, key: ServerKeyFile): void {
  const keysDir = path.join(dataDir, 'keys');
  fs.mkdirSync(keysDir, { recursive: true });
  const filePath = path.join(keysDir, `${key.kid}.json`);
  fs.writeFileSync(filePath, JSON.stringify(key, null, 2), 'utf-8');
}

export function readKeyFile(dataDir: string, kid: string): ServerKeyFile {
  const filePath = path.join(dataDir, 'keys', `${kid}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function getPrivateKeyObject(key: ServerKeyFile): crypto.KeyObject {
  const der = Buffer.from(key.private_key_b64, 'base64');
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

export function getPublicKeyObject(key: ServerKeyFile): crypto.KeyObject {
  const der = Buffer.from(key.public_key_b64, 'base64');
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function getPublicKeyObjectFromB64(publicKeyB64: string): crypto.KeyObject {
  const der = Buffer.from(publicKeyB64, 'base64');
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}
