import * as path from 'node:path';
import {
  readState,
  writeState,
  readKeyFile,
  generateSigningKey,
  writeKeyFile,
  appendAuditEvent,
} from '@openleash/core';

export async function keysListCommand() {
  const dataDir = path.join(process.cwd(), 'data');
  const state = readState(dataDir);

  console.log('Signing Keys:\n');
  for (const entry of state.server_keys.keys) {
    const key = readKeyFile(dataDir, entry.kid);
    const isActive = entry.kid === state.server_keys.active_kid;
    console.log(`  KID:        ${key.kid}${isActive ? ' (ACTIVE)' : ''}`);
    console.log(`  Public Key: ${key.public_key_b64}`);
    console.log(`  Created:    ${key.created_at}`);
    console.log(`  Revoked:    ${key.revoked_at ?? 'no'}`);
    console.log();
  }
}

export async function keysRotateCommand() {
  const dataDir = path.join(process.cwd(), 'data');
  const state = readState(dataDir);

  const newKey = generateSigningKey();
  writeKeyFile(dataDir, newKey);

  state.server_keys.keys.push({
    kid: newKey.kid,
    path: `./keys/${newKey.kid}.json`,
  });
  state.server_keys.active_kid = newKey.kid;
  writeState(dataDir, state);

  appendAuditEvent(dataDir, 'KEY_ROTATED', {
    new_kid: newKey.kid,
  });

  console.log(`Key rotated.`);
  console.log(`  New KID: ${newKey.kid}`);
  console.log(`  Public Key: ${newKey.public_key_b64}`);
}
