import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {
  validatePolicyYaml,
} from '@openleash/core';
import type { DataStore } from '@openleash/core';

export async function policyListCommand(store: DataStore) {
  const state = store.state.getState();

  if (state.policies.length === 0) {
    console.log('No policies found.');
    return;
  }

  console.log('Policies:\n');
  for (const p of state.policies) {
    console.log(`  ID:    ${p.policy_id}`);
    console.log(`  Owner: ${p.owner_type}:${p.owner_id}`);
    console.log(`  Path:  ${p.path}`);
    console.log(`  Agent: ${p.applies_to_agent_principal_id ?? '(all)'}`);
    console.log();
  }
}

export async function policyShowCommand(store: DataStore, policyId: string) {
  if (!policyId) {
    console.log('Usage: openleash policy show <policy_id>');
    return;
  }

  const state = store.state.getState();
  const entry = state.policies.find((p) => p.policy_id === policyId);
  if (!entry) {
    console.error(`Policy not found: ${policyId}`);
    process.exit(1);
  }

  const content = store.policies.read(policyId);
  console.log(content);
}

export async function policyUpsertCommand(store: DataStore, args: string[]) {
  let ownerId: string | undefined;
  let ownerType: 'user' | 'org' = 'user';
  let filePath: string | undefined;
  let appliesToAgent: string | null = null;
  let policyId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--owner' && args[i + 1]) {
      ownerId = args[++i];
    } else if (args[i] === '--owner-type' && args[i + 1]) {
      ownerType = args[++i] as 'user' | 'org';
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === '--applies-to-agent' && args[i + 1]) {
      appliesToAgent = args[++i];
    } else if (args[i] === '--policy-id' && args[i + 1]) {
      policyId = args[++i];
    }
  }

  if (!filePath) {
    console.log('Usage: openleash policy upsert --file <path> [--owner <ownerId>] [--owner-type <user|org>] [--applies-to-agent <agentId>] [--policy-id <id>]');
    return;
  }

  const yamlContent = fs.readFileSync(filePath, 'utf-8');
  const validation = validatePolicyYaml(yamlContent);
  if (!validation.valid) {
    console.error('Policy validation failed:');
    validation.errors?.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }

  // Check if updating an existing policy
  if (policyId) {
    const state = store.state.getState();
    const existing = state.policies.find((p) => p.policy_id === policyId);
    if (existing) {
      // Update: overwrite file only, no new binding
      store.policies.write(policyId, yamlContent);
      store.audit.append('POLICY_UPDATED', { policy_id: policyId });
      console.log(`Policy updated: ${policyId}`);
      return;
    }
    // Policy ID given but doesn't exist yet — create with that ID
  }

  // Insert: create new policy
  if (!ownerId) {
    console.error('--owner is required when creating a new policy.');
    process.exit(1);
  }

  const newId = policyId ?? crypto.randomUUID();
  store.policies.write(newId, yamlContent);

  store.state.updateState((s) => {
    s.policies.push({
      policy_id: newId,
      owner_type: ownerType,
      owner_id: ownerId!,
      applies_to_agent_principal_id: appliesToAgent,
      name: null,
      description: null,
      path: `./policies/${newId}.yaml`,
    });
    s.bindings.push({
      owner_type: ownerType,
      owner_id: ownerId!,
      policy_id: newId,
      applies_to_agent_principal_id: appliesToAgent,
    });
  });
  store.audit.append('POLICY_UPSERTED', { policy_id: newId, owner_type: ownerType, owner_id: ownerId });

  console.log(`Policy created: ${newId}`);
  console.log(`  Path: ./data/policies/${newId}.yaml`);
}

export async function policyDeleteCommand(store: DataStore, args: string[]) {
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

  const state = store.state.getState();
  const policyIndex = state.policies.findIndex((p) => p.policy_id === policyId);
  if (policyIndex === -1) {
    console.error(`Policy not found: ${policyId}`);
    process.exit(1);
  }

  // Remove policy file from disk
  store.policies.delete(policyId);

  // Remove from state.policies and bindings
  store.state.updateState((s) => {
    const idx = s.policies.findIndex((p) => p.policy_id === policyId);
    if (idx !== -1) {
      s.policies.splice(idx, 1);
    }
    s.bindings = s.bindings.filter((b) => b.policy_id !== policyId);
  });
  store.audit.append('POLICY_DELETED', { policy_id: policyId });

  console.log(`Policy deleted: ${policyId}`);
}

export async function policyUnbindCommand(store: DataStore, args: string[]) {
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

  const state = store.state.getState();
  const before = state.bindings.length;

  store.state.updateState((s) => {
    if (ownerId) {
      // Remove only bindings matching policy + owner
      s.bindings = s.bindings.filter(
        (b) => !(b.policy_id === policyId && b.owner_id === ownerId)
      );
    } else {
      // Remove all bindings for that policy
      s.bindings = s.bindings.filter((b) => b.policy_id !== policyId);
    }
  });

  const stateAfter = store.state.getState();
  const removed = before - stateAfter.bindings.length;
  store.audit.append('POLICY_UNBOUND', { policy_id: policyId, owner_id: ownerId ?? null, bindings_removed: removed });

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
