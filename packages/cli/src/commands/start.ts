import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createServer, loadConfig, bootstrapState } from '@openleash/server';
import { appendAuditEvent } from '@openleash/core';

export async function startCommand() {
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');

  // Bootstrap
  bootstrapState(rootDir);
  const config = loadConfig(rootDir);

  // Parse --gui / --no-gui flags
  const args = process.argv.slice(2);
  if (args.includes('--gui')) {
    config.gui = { enabled: true };
  } else if (args.includes('--no-gui')) {
    config.gui = { enabled: false };
  }

  // Load OpenAPI spec if available
  let openapiSpec: Record<string, unknown> | undefined;
  try {
    const specPath = path.join(rootDir, 'openapi', 'openapi.yaml');
    const specContent = fs.readFileSync(specPath, 'utf-8');
    openapiSpec = parseYaml(specContent) as Record<string, unknown>;
  } catch {
    // Silently skip if file is missing
  }

  const [host, portStr] = config.server.bind_address.split(':');
  const port = parseInt(portStr, 10);

  const { app } = createServer({ config, dataDir, openapiSpec });

  appendAuditEvent(dataDir, 'SERVER_STARTED', {
    bind_address: config.server.bind_address,
  });

  await app.listen({ host, port });

  const adminMode = config.admin.mode;
  const tokenRequired = adminMode === 'token' || (adminMode === 'localhost_or_token' && config.admin.token);
  const guiEnabled = config.gui?.enabled !== false;

  console.log(`
openleash running at http://${config.server.bind_address}

  Admin mode: ${adminMode}
  Admin token required: ${tokenRequired ? 'yes (for remote access)' : 'no'}
  Web GUI: ${guiEnabled ? `http://${config.server.bind_address}/gui` : 'disabled'}
  API Reference: ${openapiSpec ? `http://${config.server.bind_address}/reference` : 'disabled (openapi/openapi.yaml not found)'}

Next steps:
  npx openleash wizard              # Interactive 5-minute setup
  npx openleash policy list         # List policies
  npx openleash playground list     # List playground scenarios

Register and authorize from SDK:

  import { generateEd25519Keypair, registrationChallenge, registerAgent, authorize } from '@openleash/sdk-ts';

  const keys = generateEd25519Keypair();
  const challenge = await registrationChallenge({
    openleashUrl: 'http://${config.server.bind_address}',
    agentId: 'my-agent',
    agentPubKeyB64: keys.publicKeyB64,
  });
  // Sign challenge and register, then authorize actions
`);
}
