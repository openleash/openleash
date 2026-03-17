import { describe, it, expect } from 'vitest';
import { loadDataStore } from '../src/plugin-loader.js';
import { FileDataStore } from '../src/file-store.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-plugin-test-'));
  return dir;
}

describe('loadDataStore', () => {
  it('returns FileDataStore when config is undefined', async () => {
    const dataDir = makeTmpDir();
    const store = await loadDataStore(undefined, dataDir);
    expect(store).toBeInstanceOf(FileDataStore);
  });

  it('returns FileDataStore when type is "file"', async () => {
    const dataDir = makeTmpDir();
    const store = await loadDataStore({ type: 'file' }, dataDir);
    expect(store).toBeInstanceOf(FileDataStore);
  });

  it('throws with helpful message for missing package', async () => {
    const dataDir = makeTmpDir();
    await expect(
      loadDataStore({ type: '@openleash/store-nonexistent' }, dataDir),
    ).rejects.toThrow(/Failed to load store plugin "@openleash\/store-nonexistent"/);
  });

  it('throws with helpful message for invalid export', async () => {
    // Use a real module that doesn't export a factory function
    const dataDir = makeTmpDir();
    await expect(
      loadDataStore({ type: 'node:path' }, dataDir),
    ).rejects.toThrow(/must export a default function or named "createDataStore" function/);
  });
});
