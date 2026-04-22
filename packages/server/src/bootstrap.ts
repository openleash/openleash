import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateSigningKey,
  writeKeyFile,
  writeState,
  slugifyName,
  ensureUniqueSlug,
} from '@openleash/core';
import type { DataStore, StateData } from '@openleash/core';
import { writeDefaultConfig } from './config.js';

/**
 * Ensure every org has a `slug`. Runs on every startup; a no-op once all
 * orgs have slugs. Introduced when slugs became required (phase 1 of the
 * scope-aware GUI refactor). Any org still missing a slug gets one derived
 * from its display_name, with a numeric suffix on collision.
 */
export function migrateOrgSlugs(store: DataStore): { migrated: number } {
  const state = store.state.getState();
  const needsMigration = state.organizations.some((e) => !e.slug);
  if (!needsMigration) return { migrated: 0 };

  // Seed the in-use set with any slugs that are already assigned so we don't
  // collide with them.
  const inUse = new Set<string>(state.organizations.map((e) => e.slug).filter(Boolean));
  const assignments = new Map<string, string>(); // org_id → new slug

  for (const entry of state.organizations) {
    if (entry.slug) continue;
    let org;
    try {
      org = store.organizations.read(entry.org_id);
    } catch {
      continue; // Corrupt or missing — skip; next startup will retry.
    }
    const existing = org.slug?.trim();
    const slug = existing && existing.length > 0
      ? ensureUniqueSlug(existing, inUse)
      : ensureUniqueSlug(slugifyName(org.display_name), inUse);
    inUse.add(slug);
    assignments.set(entry.org_id, slug);
    if (org.slug !== slug) {
      store.organizations.write({ ...org, slug });
    }
  }

  if (assignments.size === 0) return { migrated: 0 };

  store.state.updateState((s) => {
    for (const entry of s.organizations) {
      const assigned = assignments.get(entry.org_id);
      if (assigned) entry.slug = assigned;
    }
  });

  return { migrated: assignments.size };
}

export function bootstrapState(rootDir: string, store?: DataStore): void {
  // Ensure config.yaml
  const configPath = path.join(rootDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    writeDefaultConfig(rootDir);
  }

  if (store) {
    store.initialize();
    migrateOrgSlugs(store);
    return;
  }

  // Legacy path (deprecated): manual directory + state bootstrap
  const dataDir = path.join(rootDir, 'data');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'keys'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'users'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'organizations'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'memberships'), { recursive: true });
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
      version: 2,
      created_at: new Date().toISOString(),
      server_keys: {
        active_kid: key.kid,
        keys: [{ kid: key.kid, path: `./keys/${key.kid}.json` }],
      },
      users: [],
      organizations: [],
      memberships: [],
      agents: [],
      policies: [],
      bindings: [],
    };

    writeState(dataDir, state);
  }
}
