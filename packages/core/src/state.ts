import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  AgentFrontmatter,
  AgentGroupMembership,
  AgentInvite,
  ApprovalRequestFrontmatter,
  UserFrontmatter,
  OrganizationFrontmatter,
  OrgMembership,
  PolicyDraftFrontmatter,
  PolicyGroupFrontmatter,
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

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error('No frontmatter found');
  }
  return parseYaml(match[1]) as Record<string, unknown>;
}

function writeFrontmatterFile(filePath: string, data: Record<string, unknown>, body: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = stringifyYaml(data, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\n${body}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

function readFrontmatterFile<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content) as unknown as T;
}

// ─── User files ─────────────────────────────────────────────────────

export function writeUserFile(dataDir: string, user: UserFrontmatter, body?: string): void {
  const filePath = path.join(dataDir, 'users', `${user.user_principal_id}.md`);
  writeFrontmatterFile(filePath, user as unknown as Record<string, unknown>, body ?? `User: ${user.display_name}`);
}

export function readUserFile(dataDir: string, userPrincipalId: string): UserFrontmatter {
  return readFrontmatterFile<UserFrontmatter>(path.join(dataDir, 'users', `${userPrincipalId}.md`));
}

export function deleteUserFile(dataDir: string, userPrincipalId: string): void {
  const filePath = path.join(dataDir, 'users', `${userPrincipalId}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Organization files ─────────────────────────────────────────────

export function writeOrgFile(dataDir: string, org: OrganizationFrontmatter, body?: string): void {
  const filePath = path.join(dataDir, 'organizations', `${org.org_id}.md`);
  writeFrontmatterFile(filePath, org as unknown as Record<string, unknown>, body ?? `Organization: ${org.display_name}`);
}

export function readOrgFile(dataDir: string, orgId: string): OrganizationFrontmatter {
  return readFrontmatterFile<OrganizationFrontmatter>(path.join(dataDir, 'organizations', `${orgId}.md`));
}

export function deleteOrgFile(dataDir: string, orgId: string): void {
  const filePath = path.join(dataDir, 'organizations', `${orgId}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Membership files ───────────────────────────────────────────────

export function writeMembershipFile(dataDir: string, membership: OrgMembership): void {
  const dir = path.join(dataDir, 'memberships');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${membership.membership_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(membership, null, 2), 'utf-8');
}

export function readMembershipFile(dataDir: string, membershipId: string): OrgMembership {
  const filePath = path.join(dataDir, 'memberships', `${membershipId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function deleteMembershipFile(dataDir: string, membershipId: string): void {
  const filePath = path.join(dataDir, 'memberships', `${membershipId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ─── Agent files ────────────────────────────────────────────────────

export function writeAgentFile(dataDir: string, agent: AgentFrontmatter, body?: string): void {
  const filePath = path.join(dataDir, 'agents', `${agent.agent_principal_id}.md`);
  writeFrontmatterFile(filePath, agent as unknown as Record<string, unknown>, body ?? `Agent: ${agent.agent_id}`);
}

export function readAgentFile(dataDir: string, agentPrincipalId: string): AgentFrontmatter {
  return readFrontmatterFile<AgentFrontmatter>(path.join(dataDir, 'agents', `${agentPrincipalId}.md`));
}

export function deleteAgentFile(dataDir: string, agentPrincipalId: string): void {
  const filePath = path.join(dataDir, 'agents', `${agentPrincipalId}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Policy files ───────────────────────────────────────────────────

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

export function deletePolicyFile(dataDir: string, policyId: string): void {
  const filePath = path.join(dataDir, "policies", `${policyId}.yaml`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ─── Approval request files ─────────────────────────────────────────

export function writeApprovalRequestFile(dataDir: string, req: ApprovalRequestFrontmatter): void {
  const filePath = path.join(dataDir, 'approval-requests', `${req.approval_request_id}.md`);
  writeFrontmatterFile(
    filePath,
    req as unknown as Record<string, unknown>,
    `Approval request for action: ${req.action_type}`,
  );
}

export function readApprovalRequestFile(dataDir: string, approvalRequestId: string): ApprovalRequestFrontmatter {
  return readFrontmatterFile<ApprovalRequestFrontmatter>(
    path.join(dataDir, 'approval-requests', `${approvalRequestId}.md`),
  );
}

export function deleteApprovalRequestFile(dataDir: string, approvalRequestId: string): void {
  const filePath = path.join(dataDir, 'approval-requests', `${approvalRequestId}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Policy draft files ─────────────────────────────────────────────

export function writePolicyDraftFile(dataDir: string, draft: PolicyDraftFrontmatter): void {
  const filePath = path.join(dataDir, 'policy-drafts', `${draft.policy_draft_id}.md`);
  writeFrontmatterFile(
    filePath,
    draft as unknown as Record<string, unknown>,
    `Policy draft from agent: ${draft.agent_id}`,
  );
}

export function readPolicyDraftFile(dataDir: string, policyDraftId: string): PolicyDraftFrontmatter {
  return readFrontmatterFile<PolicyDraftFrontmatter>(
    path.join(dataDir, 'policy-drafts', `${policyDraftId}.md`),
  );
}

export function deletePolicyDraftFile(dataDir: string, policyDraftId: string): void {
  const filePath = path.join(dataDir, 'policy-drafts', `${policyDraftId}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Policy group files ─────────────────────────────────────────────

export function writePolicyGroupFile(dataDir: string, group: PolicyGroupFrontmatter): void {
  const dir = path.join(dataDir, 'policy-groups');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${group.group_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(group, null, 2), 'utf-8');
}

export function readPolicyGroupFile(dataDir: string, groupId: string): PolicyGroupFrontmatter {
  const filePath = path.join(dataDir, 'policy-groups', `${groupId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function deletePolicyGroupFile(dataDir: string, groupId: string): void {
  const filePath = path.join(dataDir, 'policy-groups', `${groupId}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Agent-group membership files ───────────────────────────────────

export function writeAgentGroupMembershipFile(dataDir: string, m: AgentGroupMembership): void {
  const dir = path.join(dataDir, 'agent-group-memberships');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${m.membership_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(m, null, 2), 'utf-8');
}

export function readAgentGroupMembershipFile(dataDir: string, membershipId: string): AgentGroupMembership {
  const filePath = path.join(dataDir, 'agent-group-memberships', `${membershipId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function deleteAgentGroupMembershipFile(dataDir: string, membershipId: string): void {
  const filePath = path.join(dataDir, 'agent-group-memberships', `${membershipId}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── Setup invite files ─────────────────────────────────────────────

export function writeSetupInviteFile(dataDir: string, invite: SetupInvite): void {
  const dir = path.join(dataDir, 'invites');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${invite.invite_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(invite, null, 2), 'utf-8');
}

export function readSetupInviteFile(dataDir: string, inviteId: string): SetupInvite {
  const filePath = path.join(dataDir, 'invites', `${inviteId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function deleteSetupInviteFile(dataDir: string, inviteId: string): void {
  const filePath = path.join(dataDir, 'invites', `${inviteId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ─── Agent invite files ────────────────────────────────────────────

export function writeAgentInviteFile(dataDir: string, invite: AgentInvite): void {
  const dir = path.join(dataDir, 'agent-invites');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${invite.invite_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(invite, null, 2), 'utf-8');
}

export function readAgentInviteFile(dataDir: string, inviteId: string): AgentInvite {
  const filePath = path.join(dataDir, 'agent-invites', `${inviteId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function deleteAgentInviteFile(dataDir: string, inviteId: string): void {
  const filePath = path.join(dataDir, 'agent-invites', `${inviteId}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─── StateIndex ─────────────────────────────────────────────────────

export class StateIndex {
  private readonly dataDir: string;
  private readonly statePath: string;
  private cachedState: StateData | null = null;
  private cachedMtimeMs = 0;
  private cachedSize = 0;
  /** ownerType:ownerId → resolved entries (non-PENDING) */
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
    ownerType: string,
    ownerId: string,
    limit: number,
    offset: number,
  ): { items: StateApprovalRequestEntry[]; total: number } {
    this.ensureFresh();
    const key = `${ownerType}:${ownerId}`;
    const entries = this.resolvedByOwner.get(key) ?? [];
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
      const key = `${entry.owner_type}:${entry.owner_id}`;
      let list = this.resolvedByOwner.get(key);
      if (!list) {
        list = [];
        this.resolvedByOwner.set(key, list);
      }
      list.push(entry);
    }
  }
}
