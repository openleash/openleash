import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createFileDataStore } from '../src/file-store.js';
import { TransformationRule } from '../src/types.js';
import type { DataStore, TransformationFrontmatter } from '../src/index.js';

describe('transformation repository', () => {
  let dataDir: string;
  let store: DataStore;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-trans-'));
    store = createFileDataStore(dataDir);
    store.initialize();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true });
  });

  function make(id: string, overrides: Partial<TransformationFrontmatter> = {}): TransformationFrontmatter {
    return {
      transformation_id: id,
      owner_type: 'user',
      owner_id: 'owner-1',
      applies_to_agent_principal_id: null,
      name: null,
      description: null,
      enabled: true,
      rank: 100,
      rule: { type: 'cap_output_length', max_characters: 20000, max_lines: null },
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('creates the transformations directory on initialize', () => {
    expect(fs.existsSync(path.join(dataDir, 'transformations'))).toBe(true);
  });

  it('writes, reads and lists by owner', () => {
    store.transformations.write(make('t1'));
    store.transformations.write(make('t2', { owner_id: 'owner-2' }));

    expect(store.transformations.read('t1').rule.type).toBe('cap_output_length');
    const mine = store.transformations.listByOwner('user', 'owner-1');
    expect(mine).toHaveLength(1);
    expect(mine[0].transformation_id).toBe('t1');
  });

  it('invalidates the list cache on write and delete', () => {
    store.transformations.write(make('t1'));
    expect(store.transformations.listByOwner('user', 'owner-1')).toHaveLength(1);
    store.transformations.write(make('t2'));
    expect(store.transformations.listByOwner('user', 'owner-1')).toHaveLength(2);
    store.transformations.delete('t1');
    expect(store.transformations.listByOwner('user', 'owner-1')).toHaveLength(1);
  });

  it('round-trips a regex_replace rule', () => {
    store.transformations.write(
      make('t3', { rule: { type: 'regex_replace', from_pattern: '\\d+', to_pattern: '[N]' } }),
    );
    const r = store.transformations.read('t3').rule;
    expect(r.type).toBe('regex_replace');
    if (r.type === 'regex_replace') {
      expect(r.from_pattern).toBe('\\d+');
      expect(r.to_pattern).toBe('[N]');
    }
  });

  it('validates rule shapes with the exported Zod schema', () => {
    expect(TransformationRule.safeParse({ type: 'cap_output_length', max_characters: 100 }).success).toBe(true);
    expect(TransformationRule.safeParse({ type: 'regex_replace', from_pattern: 'x', to_pattern: 'y' }).success).toBe(true);
    expect(TransformationRule.safeParse({ type: 'unknown' }).success).toBe(false);
    expect(TransformationRule.safeParse({ type: 'cap_output_length', max_characters: -5 }).success).toBe(false);
  });
});
