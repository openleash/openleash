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
  ServerKeyFile,
  OrgInvite,
  SetupInvite,
  StateApprovalRequestEntry,
  StateData,
} from './types.js';
import type { AuditStore } from './audit.js';

// ─── Repository interfaces ──────────────────────────────────────────

export interface UserRepository {
  read(userPrincipalId: string): UserFrontmatter;
  write(user: UserFrontmatter, body?: string): void;
  delete(userPrincipalId: string): void;
}

export interface OrganizationRepository {
  read(orgId: string): OrganizationFrontmatter;
  write(org: OrganizationFrontmatter, body?: string): void;
  delete(orgId: string): void;
  /**
   * Look up an organization by its current slug. If no org has `slug` as its
   * current slug, falls back to scanning `slug_history` so that old bookmarks
   * continue to resolve after a slug rename. Returns `null` when no match.
   */
  readBySlug(slug: string): OrganizationFrontmatter | null;
}

export interface OrgMembershipRepository {
  read(membershipId: string): OrgMembership;
  write(membership: OrgMembership): void;
  delete(membershipId: string): void;
  listByOrg(orgId: string): OrgMembership[];
  listByUser(userPrincipalId: string): OrgMembership[];
}

export interface AgentRepository {
  read(agentPrincipalId: string): AgentFrontmatter;
  write(agent: AgentFrontmatter, body?: string): void;
  delete(agentPrincipalId: string): void;
}

export interface PolicyRepository {
  read(policyId: string): string; // raw YAML
  write(policyId: string, yamlContent: string): void;
  delete(policyId: string): void;
}

export interface ApprovalRequestRepository {
  read(approvalRequestId: string): ApprovalRequestFrontmatter;
  write(req: ApprovalRequestFrontmatter): void;
  delete(approvalRequestId: string): void;
}

export interface PolicyDraftRepository {
  read(policyDraftId: string): PolicyDraftFrontmatter;
  write(draft: PolicyDraftFrontmatter): void;
  delete(policyDraftId: string): void;
}

export interface PolicyGroupRepository {
  read(groupId: string): PolicyGroupFrontmatter;
  write(group: PolicyGroupFrontmatter): void;
  delete(groupId: string): void;
  listByOwner(ownerType: 'user' | 'org', ownerId: string): PolicyGroupFrontmatter[];
  readBySlug(ownerType: 'user' | 'org', ownerId: string, slug: string): PolicyGroupFrontmatter | null;
}

export interface AgentGroupMembershipRepository {
  read(membershipId: string): AgentGroupMembership;
  write(membership: AgentGroupMembership): void;
  delete(membershipId: string): void;
  listByGroup(groupId: string): AgentGroupMembership[];
  listByAgent(agentPrincipalId: string): AgentGroupMembership[];
}

export interface SetupInviteRepository {
  read(inviteId: string): SetupInvite;
  write(invite: SetupInvite): void;
  delete(inviteId: string): void;
}

export interface AgentInviteRepository {
  read(inviteId: string): AgentInvite;
  write(invite: AgentInvite): void;
  delete(inviteId: string): void;
}

export interface OrgInviteRepository {
  read(inviteId: string): OrgInvite;
  write(invite: OrgInvite): void;
  delete(inviteId: string): void;
  listByUser(userPrincipalId: string): OrgInvite[];
  listByOrg(orgId: string): OrgInvite[];
}

export interface KeyRepository {
  read(kid: string): ServerKeyFile;
  write(key: ServerKeyFile): void;
  generate(): ServerKeyFile;
}

export interface StateRepository {
  getState(): StateData;
  updateState(mutator: (state: StateData) => void): void;
  getResolvedApprovals(
    ownerType: string,
    ownerId: string,
    limit: number,
    offset: number,
  ): { items: StateApprovalRequestEntry[]; total: number };
}

// ─── Composite store ────────────────────────────────────────────────

export interface DataStore {
  users: UserRepository;
  organizations: OrganizationRepository;
  memberships: OrgMembershipRepository;
  agents: AgentRepository;
  policies: PolicyRepository;
  approvalRequests: ApprovalRequestRepository;
  policyDrafts: PolicyDraftRepository;
  policyGroups: PolicyGroupRepository;
  agentGroupMemberships: AgentGroupMembershipRepository;
  setupInvites: SetupInviteRepository;
  agentInvites: AgentInviteRepository;
  orgInvites: OrgInviteRepository;
  keys: KeyRepository;
  state: StateRepository;
  audit: AuditStore;
  initialize(): void;
}

/** Factory function type that store plugins must export. */
export type CreateDataStore = (options?: Record<string, unknown>) => DataStore | Promise<DataStore>;
