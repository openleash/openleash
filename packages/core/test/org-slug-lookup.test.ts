import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createFileDataStore } from '../src/file-store.js';
import type { DataStore, OrganizationFrontmatter } from '../src/index.js';

function writeOrg(store: DataStore, overrides: Partial<OrganizationFrontmatter>): OrganizationFrontmatter {
  const org: OrganizationFrontmatter = {
    org_id: crypto.randomUUID(),
    slug: 'acme',
    display_name: 'Acme',
    status: 'ACTIVE',
    attributes: {},
    created_at: new Date().toISOString(),
    created_by_user_id: crypto.randomUUID(),
    verification_status: 'unverified',
    ...overrides,
  };
  store.organizations.write(org);
  store.state.updateState((s) => {
    s.organizations.push({
      org_id: org.org_id,
      slug: org.slug,
      path: `./organizations/${org.org_id}.md`,
    });
  });
  return org;
}

describe('FileOrganizationRepository.readBySlug', () => {
  let dataDir: string;
  let store: DataStore;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-slug-'));
    store = createFileDataStore(dataDir);
    store.initialize();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('resolves an org by its current slug', () => {
    const org = writeOrg(store, { slug: 'acme-corp', display_name: 'Acme Corp' });
    const found = store.organizations.readBySlug('acme-corp');
    expect(found?.org_id).toBe(org.org_id);
  });

  it('returns null when no org matches', () => {
    writeOrg(store, { slug: 'acme-corp' });
    expect(store.organizations.readBySlug('does-not-exist')).toBeNull();
  });

  it('returns null for empty/invalid slug inputs', () => {
    expect(store.organizations.readBySlug('')).toBeNull();
    expect(store.organizations.readBySlug(null as unknown as string)).toBeNull();
  });

  it('falls back to slug_history so old URLs continue to resolve', () => {
    const org = writeOrg(store, { slug: 'new-slug', slug_history: ['old-slug'] });
    const found = store.organizations.readBySlug('old-slug');
    expect(found?.org_id).toBe(org.org_id);
  });

  it('prefers an org whose current slug matches over one whose history matches', () => {
    // Org A was renamed away from "shared-slug".
    const oldHolder = writeOrg(store, {
      slug: 'alpha-now',
      display_name: 'Alpha',
      slug_history: ['shared-slug'],
    });
    // Org B later claimed "shared-slug" as its current slug.
    const newHolder = writeOrg(store, { slug: 'shared-slug', display_name: 'Beta' });

    const found = store.organizations.readBySlug('shared-slug');
    expect(found?.org_id).toBe(newHolder.org_id);
    expect(found?.org_id).not.toBe(oldHolder.org_id);
  });
});
