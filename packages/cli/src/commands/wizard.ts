import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import prompts from 'prompts';
import { stringify as stringifyYaml } from 'yaml';
import {
  writeOwnerFile,
  writeAgentFile,
  writePolicyFile,
  readState,
  writeState,
  appendAuditEvent,
  evaluate,
  parsePolicyYaml,
  computeActionHash,
  generateSigningKey,
  writeKeyFile,
  readKeyFile,
} from '@openleash/core';
import type { ActionRequest, StateData } from '@openleash/core';
import { loadConfig, updateConfigToken, bootstrapState } from '@openleash/server';

const PROFILES: Record<string, Record<string, unknown>> = {
  CONSERVATIVE: {
    purchase_max: 10000,
    purchase_approval_above: 10000,
    allow_hairdresser: false,
    allow_healthcare: false,
    require_stepup_healthcare: false,
    allow_government: false,
    require_stepup_government: false,
    allowed_comm_domains: [],
  },
  BALANCED: {
    purchase_max: 50000,
    purchase_approval_above: 50000,
    allow_hairdresser: true,
    allow_healthcare: true,
    require_stepup_healthcare: true,
    allow_government: true,
    require_stepup_government: true,
    allowed_comm_domains: [],
  },
  AUTONOMOUS: {
    purchase_max: 200000,
    purchase_approval_above: 200000,
    allow_hairdresser: true,
    allow_healthcare: true,
    require_stepup_healthcare: true,
    allow_government: true,
    require_stepup_government: true,
    allowed_comm_domains: [],
  },
};

function generatePolicyYaml(vars: Record<string, unknown>): string {
  const rules: unknown[] = [];

  // Purchase rules
  if (typeof vars.purchase_max === 'number' && vars.purchase_max > 0) {
    rules.push({
      id: 'purchase_small_allow',
      effect: 'allow',
      action: 'purchase',
      description: `Allow purchases up to ${vars.purchase_max} minor units`,
      constraints: { amount_max: vars.purchase_max },
      proof: { required: true },
    });
  }

  if (typeof vars.purchase_approval_above === 'number') {
    rules.push({
      id: 'purchase_large_approval',
      effect: 'allow',
      action: 'purchase',
      description: `Require approval for purchases above ${vars.purchase_approval_above}`,
      constraints: { amount_min: (vars.purchase_approval_above as number) + 1 },
      obligations: [{ type: 'HUMAN_APPROVAL', params: { reason: 'Large purchase' } }],
    });
  }

  // Appointment rules
  if (vars.allow_hairdresser) {
    rules.push({
      id: 'appointment_hairdresser_allow',
      effect: 'allow',
      action: 'appointment.book',
      description: 'Allow hairdresser bookings',
      when: { match: { path: '$.payload.category', op: 'eq', value: 'hairdresser' } },
    });
  }

  if (vars.allow_healthcare) {
    const healthRule: Record<string, unknown> = {
      id: 'appointment_healthcare',
      effect: 'allow',
      action: 'appointment.book',
      description: 'Healthcare appointments',
      when: { match: { path: '$.payload.category', op: 'eq', value: 'healthcare' } },
    };
    if (vars.require_stepup_healthcare) {
      healthRule.requirements = { min_assurance_level: 'SUBSTANTIAL' };
    }
    rules.push(healthRule);
  }

  // Government rules
  if (vars.allow_government) {
    const govRule: Record<string, unknown> = {
      id: 'government_submit',
      effect: 'allow',
      action: 'government.*',
      description: 'Government submissions',
    };
    if (vars.require_stepup_government) {
      govRule.requirements = { min_assurance_level: 'HIGH' };
    }
    govRule.proof = { required: true };
    rules.push(govRule);
  } else {
    rules.push({
      id: 'government_deny',
      effect: 'deny',
      action: 'government.*',
      description: 'Deny all government submissions',
    });
  }

  // Communication rules
  const allowedDomains = vars.allowed_comm_domains as string[];
  if (allowedDomains && allowedDomains.length > 0) {
    rules.push({
      id: 'communication_allowed',
      effect: 'allow',
      action: 'communication.*',
      description: 'Allow communication to allowlisted domains',
      constraints: { allowed_domains: allowedDomains },
    });
  }
  rules.push({
    id: 'communication_deny',
    effect: 'deny',
    action: 'communication.*',
    description: 'Deny communication to non-allowlisted domains',
  });

  const policy = {
    version: 1,
    default: 'deny',
    rules,
  };

  return stringifyYaml(policy, { lineWidth: 0 });
}

export async function wizardCommand() {
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');

  // Ensure bootstrapped
  bootstrapState(rootDir);

  console.log('\n=== openleash Setup Wizard ===\n');

  // Step 1: Owner selection/creation
  const state = readState(dataDir);
  let ownerId: string;

  const { ownerChoice } = await prompts({
    type: 'select',
    name: 'ownerChoice',
    message: 'Create new owner or use existing?',
    choices: [
      { title: 'Create new owner', value: 'new' },
      ...state.owners.map((o) => ({ title: `Use existing: ${o.owner_principal_id}`, value: o.owner_principal_id })),
    ],
  });

  if (ownerChoice === 'new') {
    const { ownerType } = await prompts({
      type: 'select',
      name: 'ownerType',
      message: 'Owner type:',
      choices: [
        { title: 'HUMAN', value: 'HUMAN' },
        { title: 'ORG', value: 'ORG' },
      ],
    });

    const { displayName } = await prompts({
      type: 'text',
      name: 'displayName',
      message: 'Display name:',
      initial: 'My Owner',
    });

    ownerId = crypto.randomUUID();
    writeOwnerFile(dataDir, {
      owner_principal_id: ownerId,
      principal_type: ownerType,
      display_name: displayName,
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
    });

    const updatedState = readState(dataDir);
    updatedState.owners.push({
      owner_principal_id: ownerId,
      path: `./owners/${ownerId}.md`,
    });
    writeState(dataDir, updatedState);
    appendAuditEvent(dataDir, 'OWNER_CREATED', { owner_principal_id: ownerId, display_name: displayName });
    console.log(`  Owner created: ${ownerId}`);
  } else {
    ownerId = ownerChoice;
    console.log(`  Using owner: ${ownerId}`);
  }

  // Step 2: Agent registration mode
  const { agentMode } = await prompts({
    type: 'select',
    name: 'agentMode',
    message: 'Generate a new agent keypair or import an existing public key?',
    choices: [
      { title: 'Generate new keypair', value: 'generate' },
      { title: 'Import existing public key', value: 'import' },
    ],
  });

  let agentId: string;
  let agentPublicKeyB64: string;
  let agentPrivateKeyB64: string | null = null;

  if (agentMode === 'generate') {
    const { agentIdInput } = await prompts({
      type: 'text',
      name: 'agentIdInput',
      message: 'Agent ID:',
      initial: 'my-agent',
    });
    agentId = agentIdInput;

    const keypair = crypto.generateKeyPairSync('ed25519');
    const pubDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
    const privDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
    agentPublicKeyB64 = pubDer.toString('base64');
    agentPrivateKeyB64 = privDer.toString('base64');

    console.log(`\n  ⚠ PRIVATE KEY (store this; it is NOT saved by openleash):`);
    console.log(`  ${agentPrivateKeyB64}\n`);
  } else {
    const { agentIdInput } = await prompts({
      type: 'text',
      name: 'agentIdInput',
      message: 'Agent ID:',
    });
    agentId = agentIdInput;

    const { pubKey } = await prompts({
      type: 'text',
      name: 'pubKey',
      message: 'Public key base64 (SPKI DER):',
    });
    agentPublicKeyB64 = pubKey;
  }

  // Create agent
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
  console.log(`  Agent created: ${agentId} (${agentPrincipalId})`);

  // Step 3: Choose policy profile
  const { profile } = await prompts({
    type: 'select',
    name: 'profile',
    message: 'Choose policy profile:',
    choices: [
      { title: 'CONSERVATIVE - Strict limits, minimal autonomy', value: 'CONSERVATIVE' },
      { title: 'BALANCED - Moderate limits, step-up for sensitive actions', value: 'BALANCED' },
      { title: 'AUTONOMOUS - High limits, step-up for high-assurance only', value: 'AUTONOMOUS' },
      { title: 'CUSTOM - Configure each rule manually', value: 'CUSTOM' },
    ],
  });

  let policyVars: Record<string, unknown>;

  if (profile === 'CUSTOM') {
    const answers = await prompts([
      {
        type: 'number',
        name: 'purchase_max',
        message: 'Max purchase amount (minor units) without approval:',
        initial: 50000,
      },
      {
        type: 'confirm',
        name: 'allow_hairdresser',
        message: 'Allow hairdresser booking?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'allow_healthcare',
        message: 'Allow healthcare appointments?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'require_stepup_healthcare',
        message: 'Require step-up auth for healthcare?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'allow_government',
        message: 'Allow government submissions?',
        initial: false,
      },
      {
        type: 'confirm',
        name: 'require_stepup_government',
        message: 'Require step-up auth for government?',
        initial: true,
      },
      {
        type: 'text',
        name: 'allowed_comm_domains_str',
        message: 'Allowed communication domains (comma-separated, empty for none):',
        initial: '',
      },
    ]);

    policyVars = {
      purchase_max: answers.purchase_max,
      purchase_approval_above: answers.purchase_max,
      allow_hairdresser: answers.allow_hairdresser,
      allow_healthcare: answers.allow_healthcare,
      require_stepup_healthcare: answers.require_stepup_healthcare,
      allow_government: answers.allow_government,
      require_stepup_government: answers.require_stepup_government,
      allowed_comm_domains: answers.allowed_comm_domains_str
        ? answers.allowed_comm_domains_str.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
    };
  } else {
    policyVars = { ...PROFILES[profile] };

    // Ask up to 3 additional questions for non-custom profiles
    if (profile === 'BALANCED' || profile === 'AUTONOMOUS') {
      const additional = await prompts([
        {
          type: 'number',
          name: 'purchase_max',
          message: `Adjust max purchase amount (default: ${policyVars.purchase_max}):`,
          initial: policyVars.purchase_max as number,
        },
        {
          type: 'text',
          name: 'allowed_comm_domains_str',
          message: 'Allowed communication domains (comma-separated, empty for none):',
          initial: '',
        },
      ]);
      if (additional.purchase_max !== undefined) {
        policyVars.purchase_max = additional.purchase_max;
        policyVars.purchase_approval_above = additional.purchase_max;
      }
      if (additional.allowed_comm_domains_str) {
        policyVars.allowed_comm_domains = additional.allowed_comm_domains_str.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    } else if (profile === 'CONSERVATIVE') {
      const additional = await prompts({
        type: 'number',
        name: 'purchase_max',
        message: `Adjust max purchase amount (default: ${policyVars.purchase_max}):`,
        initial: policyVars.purchase_max as number,
      });
      if (additional.purchase_max !== undefined) {
        policyVars.purchase_max = additional.purchase_max;
        policyVars.purchase_approval_above = additional.purchase_max;
      }
    }
  }

  // Step 4: Admin access mode
  const config = loadConfig(rootDir);
  const { adminMode } = await prompts({
    type: 'select',
    name: 'adminMode',
    message: 'Admin access mode:',
    choices: [
      { title: 'localhost_or_token (default)', value: 'localhost_or_token' },
      { title: 'localhost only', value: 'localhost' },
      { title: 'token only', value: 'token' },
    ],
  });

  let adminToken = config.admin.token;
  if ((adminMode === 'token' || adminMode === 'localhost_or_token') && !adminToken) {
    adminToken = crypto.randomBytes(32).toString('hex');
    updateConfigToken(rootDir, adminToken);
    console.log(`  Admin token generated and saved to config.yaml`);
  }

  // Step 5: Policy generation
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
  appendAuditEvent(dataDir, 'POLICY_UPSERTED', { policy_id: policyId, profile });
  console.log(`\n  Policy created: ${policyId} (profile: ${profile})`);

  // Step 6: Demo runs
  console.log('\n=== Demo Runs ===\n');

  const policy = parsePolicyYaml(policyYaml);
  const demoActions: ActionRequest[] = [
    {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerId },
      relying_party: { domain: 'amazon.com', trust_profile: 'LOW' },
      payload: { amount_minor: 5000, currency: 'USD', merchant_domain: 'amazon.com' },
    },
    {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerId },
      relying_party: { domain: 'amazon.com', trust_profile: 'LOW' },
      payload: { amount_minor: 500000, currency: 'USD', merchant_domain: 'amazon.com' },
    },
    {
      action_id: crypto.randomUUID(),
      action_type: 'communication.send',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerId },
      relying_party: { domain: 'unknown.example', trust_profile: 'LOW' },
      payload: { domain: 'unknown.example' },
    },
  ];

  for (const action of demoActions) {
    const result = evaluate(action, policy, { defaultProofTtl: 120 });
    console.log(`  Action: ${action.action_type}`);
    console.log(`    Decision: ${result.response.result}`);
    console.log(`    Matched Rule: ${result.response.matched_rule_id ?? '(none)'}`);
    console.log(`    Obligations: ${result.response.obligations.length > 0 ? JSON.stringify(result.response.obligations.map(o => o.type)) : 'none'}`);
    console.log(`    Proof required: ${result.proofRequired ? 'yes' : 'no'}`);
    console.log();
  }

  // Step 7: Print agent.env snippet
  console.log('=== agent.env snippet ===\n');
  console.log(`OPENLEASH_URL=http://127.0.0.1:8787`);
  console.log(`OPENLEASH_AGENT_ID=${agentId}`);
  if (agentPrivateKeyB64) {
    console.log(`OPENLEASH_AGENT_PRIVATE_KEY_B64=${agentPrivateKeyB64}`);
  }
  if (adminToken) {
    console.log(`OPENLEASH_ADMIN_TOKEN=${adminToken}`);
  }
  console.log('\n=== Wizard complete! ===\n');
}
