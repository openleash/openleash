import type { ServerPluginContext, ServerPluginManifest, CreateServerPlugin } from './server-plugin.js';

export async function loadServerPlugin(
  pluginConfig: { type: string; options?: Record<string, unknown> },
  ctx: ServerPluginContext,
): Promise<ServerPluginManifest> {
  const packageName = pluginConfig.type;
  let mod: Record<string, unknown>;
  try {
    mod = await import(packageName);
  } catch (err) {
    throw new Error(
      `Failed to load server plugin "${packageName}". Is it installed?\n` +
      `  npm install ${packageName}`,
      { cause: err },
    );
  }

  const factory = (mod.default ?? mod.createServerPlugin) as CreateServerPlugin | undefined;
  if (typeof factory !== 'function') {
    throw new Error(
      `Server plugin "${packageName}" must export a default function or named "createServerPlugin" function.`,
    );
  }

  return factory(ctx, pluginConfig.options);
}
