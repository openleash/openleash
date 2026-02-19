import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readState,
  writeState,
  readPolicyFile,
  writePolicyFile,
  deletePolicyFile,
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
  let policyId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--owner' && args[i + 1]) {
      ownerPrincipalId = args[++i];
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === '--applies-to-agent' && args[i + 1]) {
      appliesToAgent = args[++i];
    } else if (args[i] === '--policy-id' && args[i + 1]) {
      policyId = args[++i];
    }
  }

  if (!filePath) {
    console.log('Usage: openleash policy upsert --file <path> [--owner <ownerId>] [--applies-to-agent <agentId>] [--policy-id <id>]');
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
  const state = readState(dataDir);

  // Check if updating an existing policy
  if (policyId) {
    const existing = state.policies.find((p) => p.policy_id === policyId);
    if (existing) {
      // Update: overwrite file only, no new binding
      writePolicyFile(dataDir, policyId, yamlContent);
      appendAuditEvent(dataDir, 'POLICY_UPDATED', { policy_id: policyId });
      console.log(`Policy updated: ${policyId}`);
      return;
    }
    // Policy ID given but doesn't exist yet — create with that ID
  }

  // Insert: create new policy
  if (!ownerPrincipalId) {
    console.error('--owner is required when creating a new policy.');
    process.exit(1);
  }

  const newId = policyId ?? crypto.randomUUID();
  writePolicyFile(dataDir, newId, yamlContent);

  state.policies.push({
    policy_id: newId,
    owner_principal_id: ownerPrincipalId,
    applies_to_agent_principal_id: appliesToAgent,
    path: `./policies/${newId}.yaml`,
  });
  state.bindings.push({
    owner_principal_id: ownerPrincipalId,
    policy_id: newId,
    applies_to_agent_principal_id: appliesToAgent,
  });
  writeState(dataDir, state);
  appendAuditEvent(dataDir, 'POLICY_UPSERTED', { policy_id: newId, owner_principal_id: ownerPrincipalId });

  console.log(`Policy created: ${newId}`);
  console.log(`  Path: ./data/policies/${newId}.yaml`);
}

export async function policyDeleteCommand(args: string[]) {
  let policyId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--policy-id' && args[i + 1]) {
      policyId = args[++i];
    }
  }

  if (!policyId) {
    console.log('Usage: openleash policy delete --policy-id <id>');
    return;
  }

  const dataDir = path.join(process.cwd(), 'data');
  const state = readState(dataDir);

  const policyIndex = state.policies.findIndex((p) => p.policy_id === policyId);
  if (policyIndex === -1) {
    console.error(`Policy not found: ${policyId}`);
    process.exit(1);
  }

  // Remove policy file from disk
  deletePolicyFile(dataDir, policyId);

  // Remove from state.policies
  state.policies.splice(policyIndex, 1);

  // Remove all bindings referencing this policy
  state.bindings = state.bindings.filter((b) => b.policy_id !== policyId);

  writeState(dataDir, state);
  appendAuditEvent(dataDir, 'POLICY_DELETED', { policy_id: policyId });

  console.log(`Policy deleted: ${policyId}`);
}

export async function policyUnbindCommand(args: string[]) {
  let policyId: string | undefined;
  let ownerId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--policy-id' && args[i + 1]) {
      policyId = args[++i];
    } else if (args[i] === '--owner' && args[i + 1]) {
      ownerId = args[++i];
    }
  }

  if (!policyId) {
    console.log('Usage: openleash policy unbind --policy-id <id> [--owner <ownerId>]');
    return;
  }

  const dataDir = path.join(process.cwd(), 'data');
  const state = readState(dataDir);

  const before = state.bindings.length;

  if (ownerId) {
    // Remove only bindings matching policy + owner
    state.bindings = state.bindings.filter(
      (b) => !(b.policy_id === policyId && b.owner_principal_id === ownerId)
    );
  } else {
    // Remove all bindings for that policy
    state.bindings = state.bindings.filter((b) => b.policy_id !== policyId);
  }

  const removed = before - state.bindings.length;
  writeState(dataDir, state);
  appendAuditEvent(dataDir, 'POLICY_UNBOUND', { policy_id: policyId, owner_principal_id: ownerId ?? null, bindings_removed: removed });

  console.log(`Unbound policy ${policyId}: ${removed} binding(s) removed.`);
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
