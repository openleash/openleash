import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateSigningKey,
  writeKeyFile,
  writeState,
} from '@openleash/core';
import type { DataStore, StateData } from '@openleash/core';
import { writeDefaultConfig } from './config.js';

export function bootstrapState(rootDir: string, store?: DataStore): void {
  // Ensure config.yaml
  const configPath = path.join(rootDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    writeDefaultConfig(rootDir);
  }

  if (store) {
    store.initialize();
    return;
  }

  // Legacy path (deprecated): manual directory + state bootstrap
  const dataDir = path.join(rootDir, 'data');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'keys'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'owners'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'policies'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'approval-requests'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'invites'), { recursive: true });

  const auditPath = path.join(dataDir, 'audit.log.jsonl');
  if (!fs.existsSync(auditPath)) {
    fs.writeFileSync(auditPath, '', 'utf-8');
  }

  const statePath = path.join(dataDir, 'state.md');
  if (!fs.existsSync(statePath)) {
    const key = generateSigningKey();
    writeKeyFile(dataDir, key);

    const state: StateData = {
      version: 1,
      created_at: new Date().toISOString(),
      server_keys: {
        active_kid: key.kid,
        keys: [{ kid: key.kid, path: `./keys/${key.kid}.json` }],
      },
      owners: [],
      agents: [],
      policies: [],
      bindings: [],
    };

    writeState(dataDir, state);
  }
}
