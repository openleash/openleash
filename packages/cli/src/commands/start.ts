import * as path from 'node:path';
import { createServer, loadConfig, bootstrapState } from '@openleash/server';
import { appendAuditEvent } from '@openleash/core';

export async function startCommand() {
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');

  // Bootstrap
  bootstrapState(rootDir);
  const config = loadConfig(rootDir);

  const [host, portStr] = config.server.bind_address.split(':');
  const port = parseInt(portStr, 10);

  const { app } = createServer({ config, dataDir });

  appendAuditEvent(dataDir, 'SERVER_STARTED', {
    bind_address: config.server.bind_address,
  });

  await app.listen({ host, port });

  const adminMode = config.admin.mode;
  const tokenRequired = adminMode === 'token' || (adminMode === 'localhost_or_token' && config.admin.token);

  console.log(`
openleash running at http://${config.server.bind_address}

  Admin mode: ${adminMode}
  Admin token required: ${tokenRequired ? 'yes (for remote access)' : 'no'}

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
