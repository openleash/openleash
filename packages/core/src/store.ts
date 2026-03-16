import type {
  AgentFrontmatter,
  AgentInvite,
  ApprovalRequestFrontmatter,
  OwnerFrontmatter,
  PolicyDraftFrontmatter,
  ServerKeyFile,
  SetupInvite,
  StateApprovalRequestEntry,
  StateData,
} from './types.js';
import type { AuditStore } from './audit.js';

// ─── Repository interfaces ──────────────────────────────────────────

export interface OwnerRepository {
  read(ownerPrincipalId: string): OwnerFrontmatter;
  write(owner: OwnerFrontmatter, body?: string): void;
}

export interface AgentRepository {
  read(agentPrincipalId: string): AgentFrontmatter;
  write(agent: AgentFrontmatter, body?: string): void;
}

export interface PolicyRepository {
  read(policyId: string): string; // raw YAML
  write(policyId: string, yamlContent: string): void;
  delete(policyId: string): void;
}

export interface ApprovalRequestRepository {
  read(approvalRequestId: string): ApprovalRequestFrontmatter;
  write(req: ApprovalRequestFrontmatter): void;
}

export interface PolicyDraftRepository {
  read(policyDraftId: string): PolicyDraftFrontmatter;
  write(draft: PolicyDraftFrontmatter): void;
}

export interface SetupInviteRepository {
  read(inviteId: string): SetupInvite;
  write(invite: SetupInvite): void;
  delete(inviteId: string): void;
}

export interface AgentInviteRepository {
  read(inviteId: string): AgentInvite;
  write(invite: AgentInvite): void;
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
    ownerId: string,
    limit: number,
    offset: number,
  ): { items: StateApprovalRequestEntry[]; total: number };
}

// ─── Composite store ────────────────────────────────────────────────

export interface DataStore {
  owners: OwnerRepository;
  agents: AgentRepository;
  policies: PolicyRepository;
  approvalRequests: ApprovalRequestRepository;
  policyDrafts: PolicyDraftRepository;
  setupInvites: SetupInviteRepository;
  agentInvites: AgentInviteRepository;
  keys: KeyRepository;
  state: StateRepository;
  audit: AuditStore;
  initialize(): void;
}
