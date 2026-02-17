import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  AgentFrontmatter,
  OwnerFrontmatter,
  StateData,
} from './types.js';

const STATE_HEADER = '# openleash state\n\n```yaml\n';
const STATE_FOOTER = '```\n';

export function readState(dataDir: string): StateData {
  const filePath = path.join(dataDir, 'state.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseStateMd(content);
}

export function writeState(dataDir: string, state: StateData): void {
  const filePath = path.join(dataDir, 'state.md');
  const yamlStr = stringifyYaml(state, { lineWidth: 0 });
  const content = STATE_HEADER + yamlStr + STATE_FOOTER;
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function parseStateMd(content: string): StateData {
  const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
  if (!yamlMatch) {
    throw new Error('Could not find YAML block in state.md');
  }
  return parseYaml(yamlMatch[1]) as StateData;
}

export function writeOwnerFile(
  dataDir: string,
  owner: OwnerFrontmatter,
  body?: string
): void {
  const ownersDir = path.join(dataDir, 'owners');
  fs.mkdirSync(ownersDir, { recursive: true });
  const filePath = path.join(ownersDir, `${owner.owner_principal_id}.md`);
  const frontmatter = stringifyYaml(owner, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\n${body ?? `Owner: ${owner.display_name}`}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function readOwnerFile(dataDir: string, ownerPrincipalId: string): OwnerFrontmatter {
  const filePath = path.join(dataDir, 'owners', `${ownerPrincipalId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as OwnerFrontmatter;
}

export function writeAgentFile(
  dataDir: string,
  agent: AgentFrontmatter,
  body?: string
): void {
  const agentsDir = path.join(dataDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const filePath = path.join(agentsDir, `${agent.agent_principal_id}.md`);
  const frontmatter = stringifyYaml(agent, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\n${body ?? `Agent: ${agent.agent_id}`}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function readAgentFile(dataDir: string, agentPrincipalId: string): AgentFrontmatter {
  const filePath = path.join(dataDir, 'agents', `${agentPrincipalId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as AgentFrontmatter;
}

export function writePolicyFile(dataDir: string, policyId: string, yamlContent: string): void {
  const policiesDir = path.join(dataDir, 'policies');
  fs.mkdirSync(policiesDir, { recursive: true });
  const filePath = path.join(policiesDir, `${policyId}.yaml`);
  fs.writeFileSync(filePath, yamlContent, 'utf-8');
}

export function readPolicyFile(dataDir: string, policyId: string): string {
  const filePath = path.join(dataDir, 'policies', `${policyId}.yaml`);
  return fs.readFileSync(filePath, 'utf-8');
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('No frontmatter found');
  }
  return parseYaml(match[1]) as Record<string, unknown>;
}
