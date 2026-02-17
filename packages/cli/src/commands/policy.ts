import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readState,
  writeState,
  readPolicyFile,
  writePolicyFile,
  validatePolicyYaml,
  parsePolicyYaml,
  appendAuditEvent,
} from '@openleash/core';

export async function policyListCommand() {
  const dataDir = path.join(process.cwd(), 'data');
  const state = readState(dataDir);

  if (state.policies.length === 0) {
    console.log('No policies found.');
    return;
  }

  console.log('Policies:\n');
  for (const p of state.policies) {
    console.log(`  ID:    ${p.policy_id}`);
    console.log(`  Owner: ${p.owner_principal_id}`);
    console.log(`  Path:  ${p.path}`);
    console.log(`  Agent: ${p.applies_to_agent_principal_id ?? '(all)'}`);
    console.log();
  }
}

export async function policyShowCommand(policyId: string) {
  if (!policyId) {
    console.log('Usage: openleash policy show <policy_id>');
    return;
  }

  const dataDir = path.join(process.cwd(), 'data');
  const state = readState(dataDir);
  const entry = state.policies.find((p) => p.policy_id === policyId);
  if (!entry) {
    console.error(`Policy not found: ${policyId}`);
    process.exit(1);
  }

  const content = readPolicyFile(dataDir, policyId);
  console.log(content);
}

export async function policyUpsertCommand(args: string[]) {
  let ownerPrincipalId: string | undefined;
  let filePath: string | undefined;
  let appliesToAgent: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--owner' && args[i + 1]) {
      ownerPrincipalId = args[++i];
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === '--applies-to-agent' && args[i + 1]) {
      appliesToAgent = args[++i];
    }
  }

  if (!ownerPrincipalId || !filePath) {
    console.log('Usage: openleash policy upsert --owner <ownerId> --file <path> [--applies-to-agent <agentId>]');
    return;
  }

  const yamlContent = fs.readFileSync(filePath, 'utf-8');
  const validation = validatePolicyYaml(yamlContent);
  if (!validation.valid) {
    console.error('Policy validation failed:');
    validation.errors?.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }

  const dataDir = path.join(process.cwd(), 'data');
  const policyId = crypto.randomUUID();
  writePolicyFile(dataDir, policyId, yamlContent);

  const state = readState(dataDir);
  state.policies.push({
    policy_id: policyId,
    owner_principal_id: ownerPrincipalId,
    applies_to_agent_principal_id: appliesToAgent,
    path: `./policies/${policyId}.yaml`,
  });
  state.bindings.push({
    owner_principal_id: ownerPrincipalId,
    policy_id: policyId,
    applies_to_agent_principal_id: appliesToAgent,
  });
  writeState(dataDir, state);
  appendAuditEvent(dataDir, 'POLICY_UPSERTED', { policy_id: policyId, owner_principal_id: ownerPrincipalId });

  console.log(`Policy created: ${policyId}`);
  console.log(`  Path: ./data/policies/${policyId}.yaml`);
}

export async function policyValidateCommand(args: string[]) {
  let filePath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    }
  }

  if (!filePath) {
    console.log('Usage: openleash policy validate --file <path>');
    return;
  }

  const yamlContent = fs.readFileSync(filePath, 'utf-8');
  const validation = validatePolicyYaml(yamlContent);

  if (validation.valid) {
    console.log('OK - Policy is valid.');
  } else {
    console.error('Policy validation failed:');
    validation.errors?.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }
}
