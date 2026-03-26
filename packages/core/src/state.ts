import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  AgentFrontmatter,
  AgentInvite,
  ApprovalRequestFrontmatter,
  OwnerFrontmatter,
  PolicyDraftFrontmatter,
  SetupInvite,
  StateApprovalRequestEntry,
  StateData,
} from './types.js';

const STATE_HEADER = '# openleash state\n\n```yaml\n';
const STATE_FOOTER = '```\n';

/** @deprecated Use `store.state.getState()` instead. */
export function readState(dataDir: string): StateData {
  const filePath = path.join(dataDir, 'state.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseStateMd(content);
}

/** @deprecated Use `store.state.updateState()` instead. */
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

/** @deprecated Use `store.owners.write()` instead. */
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

/** @deprecated Use `store.owners.read()` instead. */
export function readOwnerFile(dataDir: string, ownerPrincipalId: string): OwnerFrontmatter {
  const filePath = path.join(dataDir, 'owners', `${ownerPrincipalId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as OwnerFrontmatter;
}

/** @deprecated Use `store.agents.write()` instead. */
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

/** @deprecated Use `store.agents.read()` instead. */
export function readAgentFile(dataDir: string, agentPrincipalId: string): AgentFrontmatter {
  const filePath = path.join(dataDir, 'agents', `${agentPrincipalId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as AgentFrontmatter;
}

/** @deprecated Use `store.policies.write()` instead. */
export function writePolicyFile(dataDir: string, policyId: string, yamlContent: string): void {
  const policiesDir = path.join(dataDir, 'policies');
  fs.mkdirSync(policiesDir, { recursive: true });
  const filePath = path.join(policiesDir, `${policyId}.yaml`);
  fs.writeFileSync(filePath, yamlContent, 'utf-8');
}

/** @deprecated Use `store.policies.read()` instead. */
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

/** @deprecated Use `store.policies.delete()` instead. */
export function deletePolicyFile(dataDir: string, policyId: string): void {
  const filePath = path.join(dataDir, "policies", `${policyId}.yaml`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ─── Approval request files ─────────────────────────────────────────

/** @deprecated Use `store.approvalRequests.write()` instead. */
export function writeApprovalRequestFile(
  dataDir: string,
  req: ApprovalRequestFrontmatter
): void {
  const dir = path.join(dataDir, 'approval-requests');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${req.approval_request_id}.md`);
  const frontmatter = stringifyYaml(req, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\nApproval request for action: ${req.action_type}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** @deprecated Use `store.approvalRequests.read()` instead. */
export function readApprovalRequestFile(
  dataDir: string,
  approvalRequestId: string
): ApprovalRequestFrontmatter {
  const filePath = path.join(dataDir, 'approval-requests', `${approvalRequestId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as ApprovalRequestFrontmatter;
}

// ─── Policy draft files ─────────────────────────────────────────────

/** @deprecated Use `store.policyDrafts.write()` instead. */
export function writePolicyDraftFile(
  dataDir: string,
  draft: PolicyDraftFrontmatter
): void {
  const dir = path.join(dataDir, 'policy-drafts');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${draft.policy_draft_id}.md`);
  const frontmatter = stringifyYaml(draft, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\nPolicy draft from agent: ${draft.agent_id}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** @deprecated Use `store.policyDrafts.read()` instead. */
export function readPolicyDraftFile(
  dataDir: string,
  policyDraftId: string
): PolicyDraftFrontmatter {
  const filePath = path.join(dataDir, 'policy-drafts', `${policyDraftId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as PolicyDraftFrontmatter;
}

// ─── Setup invite files ─────────────────────────────────────────────

/** @deprecated Use `store.setupInvites.write()` instead. */
export function writeSetupInviteFile(dataDir: string, invite: SetupInvite): void {
  const dir = path.join(dataDir, 'invites');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${invite.invite_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(invite, null, 2), 'utf-8');
}

/** @deprecated Use `store.setupInvites.read()` instead. */
export function readSetupInviteFile(dataDir: string, inviteId: string): SetupInvite {
  const filePath = path.join(dataDir, 'invites', `${inviteId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** @deprecated Use `store.setupInvites.delete()` instead. */
export function deleteSetupInviteFile(dataDir: string, inviteId: string): void {
  const filePath = path.join(dataDir, 'invites', `${inviteId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ─── Agent invite files ────────────────────────────────────────────

/** @deprecated Use `store.agentInvites.write()` instead. */
export function writeAgentInviteFile(dataDir: string, invite: AgentInvite): void {
  const dir = path.join(dataDir, 'agent-invites');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${invite.invite_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(invite, null, 2), 'utf-8');
}

/** @deprecated Use `store.agentInvites.read()` instead. */
export function readAgentInviteFile(dataDir: string, inviteId: string): AgentInvite {
  const filePath = path.join(dataDir, 'agent-invites', `${inviteId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ─── StateIndex ─────────────────────────────────────────────────────

export class StateIndex {
  private readonly dataDir: string;
  private readonly statePath: string;
  private cachedState: StateData | null = null;
  private cachedMtimeMs = 0;
  private cachedSize = 0;
  /** owner_principal_id → resolved entries (non-PENDING) */
  private resolvedByOwner: Map<string, StateApprovalRequestEntry[]> = new Map();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, 'state.md');
  }

  /** Return the cached (and possibly refreshed) state. */
  getState(): StateData {
    this.ensureFresh();
    return this.cachedState!;
  }

  /** Paginated resolved approval entries for a given owner. */
  getResolvedApprovals(
    ownerId: string,
    limit: number,
    offset: number,
  ): { items: StateApprovalRequestEntry[]; total: number } {
    this.ensureFresh();
    const entries = this.resolvedByOwner.get(ownerId) ?? [];
    const total = entries.length;
    const start = Math.max(total - offset - limit, 0);
    const end = total - offset;
    return { items: entries.slice(start, end), total };
  }

  private ensureFresh(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.statePath);
    } catch {
      this.cachedState = null;
      this.resolvedByOwner.clear();
      return;
    }

    if (this.cachedState && stat.mtimeMs === this.cachedMtimeMs && stat.size === this.cachedSize) {
      return; // unchanged
    }

    this.cachedState = readState(this.dataDir);
    this.cachedMtimeMs = stat.mtimeMs;
    this.cachedSize = stat.size;
    this.rebuildApprovalIndex();
  }

  private rebuildApprovalIndex(): void {
    this.resolvedByOwner.clear();
    const entries = this.cachedState?.approval_requests ?? [];
    for (const entry of entries) {
      if (entry.status === 'PENDING') continue;
      let list = this.resolvedByOwner.get(entry.owner_principal_id);
      if (!list) {
        list = [];
        this.resolvedByOwner.set(entry.owner_principal_id, list);
      }
      list.push(entry);
    }
  }
}
