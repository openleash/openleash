import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateSigningKey,
  writeKeyFile,
  writeState,
  writeOwnerFile,
  writePolicyFile,
  appendAuditEvent,
} from '@openleash/core';
import type { StateData } from '@openleash/core';
import { loadConfig, writeDefaultConfig } from './config.js';

const DEFAULT_DENY_POLICY = `version: 1
default: deny
rules: []
`;

export function bootstrapState(rootDir: string): void {
  const dataDir = path.join(rootDir, 'data');

  // Ensure config.yaml
  const configPath = path.join(rootDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    writeDefaultConfig(rootDir);
  }

  // Ensure ./data directory
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'keys'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'owners'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'policies'), { recursive: true });

  // Ensure audit.log.jsonl
  const auditPath = path.join(dataDir, 'audit.log.jsonl');
  if (!fs.existsSync(auditPath)) {
    fs.writeFileSync(auditPath, '', 'utf-8');
  }

  // Ensure state.md
  const statePath = path.join(dataDir, 'state.md');
  if (!fs.existsSync(statePath)) {
    // Generate server signing key
    const key = generateSigningKey();
    writeKeyFile(dataDir, key);

    // Create default owner
    const ownerId = crypto.randomUUID();
    writeOwnerFile(dataDir, {
      owner_principal_id: ownerId,
      principal_type: 'HUMAN',
      display_name: 'Default Owner',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    // Create default deny policy
    const policyId = crypto.randomUUID();
    writePolicyFile(dataDir, policyId, DEFAULT_DENY_POLICY);

    // Write state.md
    const state: StateData = {
      version: 1,
      created_at: new Date().toISOString(),
      server_keys: {
        active_kid: key.kid,
        keys: [{ kid: key.kid, path: `./keys/${key.kid}.json` }],
      },
      owners: [{ owner_principal_id: ownerId, path: `./owners/${ownerId}.md` }],
      agents: [],
      policies: [
        {
          policy_id: policyId,
          owner_principal_id: ownerId,
          applies_to_agent_principal_id: null,
          path: `./policies/${policyId}.yaml`,
        },
      ],
      bindings: [
        {
          owner_principal_id: ownerId,
          policy_id: policyId,
          applies_to_agent_principal_id: null,
        },
      ],
    };

    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'OWNER_CREATED', { owner_principal_id: ownerId, display_name: 'Default Owner' });
    appendAuditEvent(dataDir, 'POLICY_UPSERTED', { policy_id: policyId });
  }
}
