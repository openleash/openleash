import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parsePolicyYaml,
  evaluate,
  computeActionHash,
  readState,
  readPolicyFile,
  appendAuditEvent,
  ActionRequestSchema,
} from '@openleash/core';
import type { ActionRequest } from '@openleash/core';

function getScenariosDir(): string {
  // Look for playground/scenarios relative to package root
  const candidates = [
    path.join(process.cwd(), 'playground', 'scenarios'),
    path.join(__dirname, '..', '..', '..', '..', 'playground', 'scenarios'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export async function playgroundListCommand() {
  const dir = getScenariosDir();
  if (!fs.existsSync(dir)) {
    console.log('No scenarios found. Expected directory: playground/scenarios/');
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No scenarios found.');
    return;
  }

  console.log('Available scenarios:\n');
  for (const f of files) {
    console.log(`  ${f.replace('.json', '')}`);
  }
}

export async function playgroundRunCommand(scenarioName: string, args: string[]) {
  if (!scenarioName) {
    console.log('Usage: openleash playground run <scenarioName> [--policy <file>] [--policy-id <id>]');
    return;
  }

  // Parse args
  let policyFile: string | undefined;
  let policyId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--policy' && args[i + 1]) policyFile = args[++i];
    if (args[i] === '--policy-id' && args[i + 1]) policyId = args[++i];
  }

  // Load scenario
  const dir = getScenariosDir();
  const scenarioPath = path.join(dir, `${scenarioName}.json`);
  if (!fs.existsSync(scenarioPath)) {
    console.error(`Scenario not found: ${scenarioName}`);
    console.error(`  Expected at: ${scenarioPath}`);
    process.exit(1);
  }

  const scenarioData = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
  const parseResult = ActionRequestSchema.safeParse(scenarioData);
  if (!parseResult.success) {
    console.error('Invalid scenario action:', parseResult.error.flatten());
    process.exit(1);
  }
  const action = parseResult.data;

  // Load policy
  let policyYaml: string;
  if (policyFile) {
    policyYaml = fs.readFileSync(policyFile, 'utf-8');
  } else if (policyId) {
    const dataDir = path.join(process.cwd(), 'data');
    policyYaml = readPolicyFile(dataDir, policyId);
  } else {
    // Use first policy from state
    const dataDir = path.join(process.cwd(), 'data');
    const state = readState(dataDir);
    if (state.policies.length === 0) {
      console.error('No policies found. Use --policy <file> or --policy-id <id>.');
      process.exit(1);
    }
    const firstPolicy = state.policies[state.policies.length - 1]; // Use most recent
    policyYaml = readPolicyFile(dataDir, firstPolicy.policy_id);
  }

  const policy = parsePolicyYaml(policyYaml);
  const actionHash = computeActionHash(action);
  const result = evaluate(action, policy, { defaultProofTtl: 120 });

  // Print output
  console.log(`\n=== Playground: ${scenarioName} ===\n`);
  console.log(`Action Hash:     ${actionHash}`);
  console.log(`Matched Rule:    ${result.response.matched_rule_id ?? '(none)'}`);
  console.log(`Decision:        ${result.response.result}`);
  console.log(`Reason:          ${result.response.reason}`);
  console.log(`Obligations:     ${JSON.stringify(result.response.obligations, null, 2)}`);
  console.log(`Proof Token:     ${result.response.proof_token ?? '(none)'}`);
  console.log(`Proof Required:  ${result.proofRequired ? 'yes' : 'no'}`);
  console.log();

  // Evaluation trace
  console.log('Evaluation Trace:');
  for (const t of result.trace.rules) {
    console.log(`  Rule: ${t.rule_id}`);
    console.log(`    pattern_match:     ${t.pattern_match ? 'YES' : 'NO'}`);
    console.log(`    when_match:        ${t.when_match === null ? 'N/A' : t.when_match ? 'YES' : 'NO'}`);
    console.log(`    constraints_match: ${t.constraints_match === null ? 'N/A' : t.constraints_match ? 'YES' : 'NO'}`);
    console.log(`    final_match:       ${t.final_match ? 'YES' : 'NO'}`);
  }

  // Emit audit event
  try {
    const dataDir = path.join(process.cwd(), 'data');
    appendAuditEvent(dataDir, 'PLAYGROUND_RUN', {
      scenario: scenarioName,
      result: result.response.result,
    });
  } catch {
    // Audit logging is best-effort in playground
  }
}
