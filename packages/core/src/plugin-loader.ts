import { createFileDataStore } from './file-store.js';
import type { DataStore, CreateDataStore } from './store.js';

export async function loadDataStore(
  storeConfig: { type: string; options?: Record<string, unknown> } | undefined,
  dataDir: string,
): Promise<DataStore> {
  if (!storeConfig || storeConfig.type === 'file') {
    return createFileDataStore(dataDir);
  }

  const packageName = storeConfig.type;
  let mod: Record<string, unknown>;
  try {
    mod = await import(packageName);
  } catch (err) {
    throw new Error(
      `Failed to load store plugin "${packageName}". Is it installed?\n` +
      `  npm install ${packageName}\n` +
      `Original error: ${(err as Error).message}`,
    );
  }

  const factory = (mod.default ?? mod.createDataStore) as CreateDataStore | undefined;
  if (typeof factory !== 'function') {
    throw new Error(
      `Store plugin "${packageName}" must export a default function or named "createDataStore" function.`,
    );
  }

  return factory(storeConfig.options);
}
