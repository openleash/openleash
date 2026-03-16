import type { DataStore } from '@openleash/core';

export async function keysListCommand(store: DataStore) {
  const state = store.state.getState();

  console.log('Signing Keys:\n');
  for (const entry of state.server_keys.keys) {
    const key = store.keys.read(entry.kid);
    const isActive = entry.kid === state.server_keys.active_kid;
    console.log(`  KID:        ${key.kid}${isActive ? ' (ACTIVE)' : ''}`);
    console.log(`  Public Key: ${key.public_key_b64}`);
    console.log(`  Created:    ${key.created_at}`);
    console.log(`  Revoked:    ${key.revoked_at ?? 'no'}`);
    console.log();
  }
}

export async function keysRotateCommand(store: DataStore) {
  const newKey = store.keys.generate();
  store.keys.write(newKey);

  store.state.updateState((s) => {
    s.server_keys.keys.push({
      kid: newKey.kid,
      path: `./keys/${newKey.kid}.json`,
    });
    s.server_keys.active_kid = newKey.kid;
  });

  store.audit.append('KEY_ROTATED', {
    new_kid: newKey.kid,
  });

  console.log(`Key rotated.`);
  console.log(`  New KID: ${newKey.kid}`);
  console.log(`  Public Key: ${newKey.public_key_b64}`);
}
