import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  writeOwnerFile,
  writeAgentFile,
  writePolicyFile,
  readState,
  writeState,
  appendAuditEvent,
} from '@openleash/core';
import { bootstrapState } from '@openleash/server';
import { PROFILES, generatePolicyYaml } from './policy-profiles.js';

export async function initCommand(args: string[]) {
  let ownerName: string | undefined;
  let agentId: string | undefined;
  let outputEnv: string | undefined;
  let policyProfile: string = 'balanced';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--owner-name' && args[i + 1]) {
      ownerName = args[++i];
    } else if (args[i] === '--agent-id' && args[i + 1]) {
      agentId = args[++i];
    } else if (args[i] === '--output-env' && args[i + 1]) {
      outputEnv = args[++i];
    } else if (args[i] === '--policy-profile' && args[i + 1]) {
      policyProfile = args[++i];
    }
  }

  if (!ownerName || !agentId) {
    console.log('Usage: openleash init --owner-name <name> --agent-id <id> [--output-env <path>] [--policy-profile <conservative|balanced|autonomous>]');
    return;
  }

  const profileKey = policyProfile.toUpperCase();
  if (!PROFILES[profileKey]) {
    console.error(`Unknown policy profile: ${policyProfile}. Choose from: conservative, balanced, autonomous`);
    process.exit(1);
  }

  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');

  // 1. Bootstrap state
  bootstrapState(rootDir);
  console.log('State bootstrapped.');

  // 2. Create owner
  const ownerId = crypto.randomUUID();
  writeOwnerFile(dataDir, {
    owner_principal_id: ownerId,
    principal_type: 'HUMAN',
    display_name: ownerName,
    status: 'ACTIVE',
    attributes: {},
    created_at: new Date().toISOString(),
  });

  const state = readState(dataDir);
  state.owners.push({
    owner_principal_id: ownerId,
    path: `./owners/${ownerId}.md`,
  });
  writeState(dataDir, state);
  appendAuditEvent(dataDir, 'OWNER_CREATED', { owner_principal_id: ownerId, display_name: ownerName });
  console.log(`Owner created: ${ownerName} (${ownerId})`);

  // 3. Generate Ed25519 keypair
  const keypair = crypto.generateKeyPairSync('ed25519');
  const pubDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
  const privDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
  const agentPublicKeyB64 = pubDer.toString('base64');
  const agentPrivateKeyB64 = privDer.toString('base64');

  // 4. Create agent (direct file write — local admin operation, no challenge-response)
  const agentPrincipalId = crypto.randomUUID();
  writeAgentFile(dataDir, {
    agent_principal_id: agentPrincipalId,
    agent_id: agentId,
    owner_principal_id: ownerId,
    public_key_b64: agentPublicKeyB64,
    status: 'ACTIVE',
    attributes: {},
    created_at: new Date().toISOString(),
    revoked_at: null,
  });

  const stateAfterAgent = readState(dataDir);
  stateAfterAgent.agents.push({
    agent_principal_id: agentPrincipalId,
    agent_id: agentId,
    owner_principal_id: ownerId,
    path: `./agents/${agentPrincipalId}.md`,
  });
  writeState(dataDir, stateAfterAgent);
  appendAuditEvent(dataDir, 'AGENT_REGISTERED', { agent_principal_id: agentPrincipalId, agent_id: agentId });
  console.log(`Agent created: ${agentId} (${agentPrincipalId})`);

  // 5. Generate policy from profile, write and bind
  const policyVars = { ...PROFILES[profileKey] };
  const policyYaml = generatePolicyYaml(policyVars);
  const policyId = crypto.randomUUID();
  writePolicyFile(dataDir, policyId, policyYaml);

  const stateForPolicy = readState(dataDir);
  stateForPolicy.policies.push({
    policy_id: policyId,
    owner_principal_id: ownerId,
    applies_to_agent_principal_id: null,
    path: `./policies/${policyId}.yaml`,
  });
  stateForPolicy.bindings.push({
    owner_principal_id: ownerId,
    policy_id: policyId,
    applies_to_agent_principal_id: null,
  });
  writeState(dataDir, stateForPolicy);
  appendAuditEvent(dataDir, 'POLICY_UPSERTED', { policy_id: policyId, profile: profileKey });
  console.log(`Policy created: ${policyId} (profile: ${profileKey})`);

  // 6. Output env vars
  const envLines = [
    `OPENLEASH_URL=http://127.0.0.1:8787`,
    `OPENLEASH_AGENT_ID=${agentId}`,
    `OPENLEASH_AGENT_PRIVATE_KEY_B64=${agentPrivateKeyB64}`,
    `OWNER_PRINCIPAL_ID=${ownerId}`,
  ];
  const envContent = envLines.join('\n') + '\n';

  if (outputEnv) {
    fs.writeFileSync(outputEnv, envContent, 'utf-8');
    console.log(`Environment variables written to: ${outputEnv}`);
  } else {
    console.log('\n--- Environment Variables ---');
    console.log(envContent);
  }

  // 7. Print summary
  console.log('--- Summary ---');
  console.log(`  Owner:          ${ownerName} (${ownerId})`);
  console.log(`  Agent:          ${agentId} (${agentPrincipalId})`);
  console.log(`  Policy:         ${policyId} (${profileKey})`);
  console.log(`  Policy profile: ${profileKey}`);
  console.log('');
  console.log('Ready! Start the server with: npx openleash start');
}
