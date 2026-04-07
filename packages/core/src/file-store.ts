import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readState,
  writeState,
  writeUserFile,
  readUserFile,
  writeOrgFile,
  readOrgFile,
  writeMembershipFile,
  readMembershipFile,
  deleteMembershipFile,
  writeAgentFile,
  readAgentFile,
  writePolicyFile,
  readPolicyFile,
  deletePolicyFile,
  writeApprovalRequestFile,
  readApprovalRequestFile,
  writePolicyDraftFile,
  readPolicyDraftFile,
  writeSetupInviteFile,
  readSetupInviteFile,
  deleteSetupInviteFile,
  writeAgentInviteFile,
  readAgentInviteFile,
  StateIndex,
} from './state.js';
import {
  generateSigningKey,
  writeKeyFile,
  readKeyFile,
} from './keys.js';
import { FileAuditStore } from './audit.js';
import type { AuditStore } from './audit.js';
import type {
  AgentFrontmatter,
  AgentInvite,
  ApprovalRequestFrontmatter,
  UserFrontmatter,
  OrganizationFrontmatter,
  OrgMembership,
  PolicyDraftFrontmatter,
  ServerKeyFile,
  OrgInvite,
  SetupInvite,
  StateApprovalRequestEntry,
  StateData,
} from './types.js';
import type {
  DataStore,
  UserRepository,
  OrganizationRepository,
  OrgMembershipRepository,
  AgentRepository,
  PolicyRepository,
  ApprovalRequestRepository,
  PolicyDraftRepository,
  SetupInviteRepository,
  AgentInviteRepository,
  OrgInviteRepository,
  KeyRepository,
  StateRepository,
} from './store.js';

// ─── File-based repository implementations ──────────────────────────

class FileUserRepository implements UserRepository {
  constructor(private readonly dataDir: string) {}

  read(userPrincipalId: string): UserFrontmatter {
    return readUserFile(this.dataDir, userPrincipalId);
  }

  write(user: UserFrontmatter, body?: string): void {
    writeUserFile(this.dataDir, user, body);
  }
}

class FileOrganizationRepository implements OrganizationRepository {
  constructor(private readonly dataDir: string) {}

  read(orgId: string): OrganizationFrontmatter {
    return readOrgFile(this.dataDir, orgId);
  }

  write(org: OrganizationFrontmatter, body?: string): void {
    writeOrgFile(this.dataDir, org, body);
  }
}

class FileOrgMembershipRepository implements OrgMembershipRepository {
  constructor(private readonly dataDir: string) {}

  read(membershipId: string): OrgMembership {
    return readMembershipFile(this.dataDir, membershipId);
  }

  write(membership: OrgMembership): void {
    writeMembershipFile(this.dataDir, membership);
  }

  delete(membershipId: string): void {
    deleteMembershipFile(this.dataDir, membershipId);
  }

  listByOrg(orgId: string): OrgMembership[] {
    const dir = path.join(this.dataDir, 'memberships');
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const results: OrgMembership[] = [];
    for (const file of files) {
      const membership = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as OrgMembership;
      if (membership.org_id === orgId) results.push(membership);
    }
    return results;
  }

  listByUser(userPrincipalId: string): OrgMembership[] {
    const dir = path.join(this.dataDir, 'memberships');
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const results: OrgMembership[] = [];
    for (const file of files) {
      const membership = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as OrgMembership;
      if (membership.user_principal_id === userPrincipalId) results.push(membership);
    }
    return results;
  }
}

class FileAgentRepository implements AgentRepository {
  constructor(private readonly dataDir: string) {}

  read(agentPrincipalId: string): AgentFrontmatter {
    return readAgentFile(this.dataDir, agentPrincipalId);
  }

  write(agent: AgentFrontmatter, body?: string): void {
    writeAgentFile(this.dataDir, agent, body);
  }
}

class FilePolicyRepository implements PolicyRepository {
  constructor(private readonly dataDir: string) {}

  read(policyId: string): string {
    return readPolicyFile(this.dataDir, policyId);
  }

  write(policyId: string, yamlContent: string): void {
    writePolicyFile(this.dataDir, policyId, yamlContent);
  }

  delete(policyId: string): void {
    deletePolicyFile(this.dataDir, policyId);
  }
}

class FileApprovalRequestRepository implements ApprovalRequestRepository {
  constructor(private readonly dataDir: string) {}

  read(approvalRequestId: string): ApprovalRequestFrontmatter {
    return readApprovalRequestFile(this.dataDir, approvalRequestId);
  }

  write(req: ApprovalRequestFrontmatter): void {
    writeApprovalRequestFile(this.dataDir, req);
  }
}

class FilePolicyDraftRepository implements PolicyDraftRepository {
  constructor(private readonly dataDir: string) {}

  read(policyDraftId: string): PolicyDraftFrontmatter {
    return readPolicyDraftFile(this.dataDir, policyDraftId);
  }

  write(draft: PolicyDraftFrontmatter): void {
    writePolicyDraftFile(this.dataDir, draft);
  }
}

class FileSetupInviteRepository implements SetupInviteRepository {
  constructor(private readonly dataDir: string) {}

  read(inviteId: string): SetupInvite {
    return readSetupInviteFile(this.dataDir, inviteId);
  }

  write(invite: SetupInvite): void {
    writeSetupInviteFile(this.dataDir, invite);
  }

  delete(inviteId: string): void {
    deleteSetupInviteFile(this.dataDir, inviteId);
  }
}

class FileAgentInviteRepository implements AgentInviteRepository {
  constructor(private readonly dataDir: string) {}

  read(inviteId: string): AgentInvite {
    return readAgentInviteFile(this.dataDir, inviteId);
  }

  write(invite: AgentInvite): void {
    writeAgentInviteFile(this.dataDir, invite);
  }
}

class FileOrgInviteRepository implements OrgInviteRepository {
  private cache: OrgInvite[] | null = null;

  constructor(private readonly dataDir: string) {}

  private get dir() { return path.join(this.dataDir, 'org-invites'); }

  private loadAll(): OrgInvite[] {
    if (this.cache) return this.cache;
    const dir = this.dir;
    if (!fs.existsSync(dir)) { this.cache = []; return this.cache; }
    this.cache = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as OrgInvite);
    return this.cache;
  }

  read(inviteId: string): OrgInvite {
    const filePath = path.join(this.dir, `${inviteId}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  write(invite: OrgInvite): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, `${invite.invite_id}.json`), JSON.stringify(invite, null, 2), 'utf-8');
    this.cache = null; // invalidate
  }

  delete(inviteId: string): void {
    const filePath = path.join(this.dir, `${inviteId}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    this.cache = null;
  }

  listByUser(userPrincipalId: string): OrgInvite[] {
    return this.loadAll().filter((i) => i.user_principal_id === userPrincipalId);
  }

  listByOrg(orgId: string): OrgInvite[] {
    return this.loadAll().filter((i) => i.org_id === orgId);
  }
}

class FileKeyRepository implements KeyRepository {
  constructor(private readonly dataDir: string) {}

  read(kid: string): ServerKeyFile {
    return readKeyFile(this.dataDir, kid);
  }

  write(key: ServerKeyFile): void {
    writeKeyFile(this.dataDir, key);
  }

  generate(): ServerKeyFile {
    return generateSigningKey();
  }
}

class FileStateRepository implements StateRepository {
  private readonly stateIndex: StateIndex;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.stateIndex = new StateIndex(dataDir);
  }

  getState(): StateData {
    return this.stateIndex.getState();
  }

  updateState(mutator: (state: StateData) => void): void {
    const state = readState(this.dataDir);
    mutator(state);
    writeState(this.dataDir, state);
  }

  getResolvedApprovals(
    ownerType: string,
    ownerId: string,
    limit: number,
    offset: number,
  ): { items: StateApprovalRequestEntry[]; total: number } {
    return this.stateIndex.getResolvedApprovals(ownerType, ownerId, limit, offset);
  }
}

// ─── FileDataStore ──────────────────────────────────────────────────

export class FileDataStore implements DataStore {
  readonly users: UserRepository;
  readonly organizations: OrganizationRepository;
  readonly memberships: OrgMembershipRepository;
  readonly agents: AgentRepository;
  readonly policies: PolicyRepository;
  readonly approvalRequests: ApprovalRequestRepository;
  readonly policyDrafts: PolicyDraftRepository;
  readonly setupInvites: SetupInviteRepository;
  readonly agentInvites: AgentInviteRepository;
  readonly orgInvites: OrgInviteRepository;
  readonly keys: KeyRepository;
  readonly state: StateRepository;
  readonly audit: AuditStore;

  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.users = new FileUserRepository(dataDir);
    this.organizations = new FileOrganizationRepository(dataDir);
    this.memberships = new FileOrgMembershipRepository(dataDir);
    this.agents = new FileAgentRepository(dataDir);
    this.policies = new FilePolicyRepository(dataDir);
    this.approvalRequests = new FileApprovalRequestRepository(dataDir);
    this.policyDrafts = new FilePolicyDraftRepository(dataDir);
    this.setupInvites = new FileSetupInviteRepository(dataDir);
    this.agentInvites = new FileAgentInviteRepository(dataDir);
    this.orgInvites = new FileOrgInviteRepository(dataDir);
    this.keys = new FileKeyRepository(dataDir);
    this.state = new FileStateRepository(dataDir);
    this.audit = new FileAuditStore(dataDir);
  }

  initialize(): void {
    // Ensure data directories
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'keys'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'users'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'organizations'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'memberships'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'policies'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'approval-requests'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'invites'), { recursive: true });

    // Ensure audit log
    const auditPath = path.join(this.dataDir, 'audit.log.jsonl');
    if (!fs.existsSync(auditPath)) {
      fs.writeFileSync(auditPath, '', 'utf-8');
    }

    // Ensure state.md
    const statePath = path.join(this.dataDir, 'state.md');
    if (!fs.existsSync(statePath)) {
      const key = this.keys.generate();
      this.keys.write(key);

      const state: StateData = {
        version: 2,
        created_at: new Date().toISOString(),
        server_keys: {
          active_kid: key.kid,
          keys: [{ kid: key.kid, path: `./keys/${key.kid}.json` }],
        },
        users: [],
        organizations: [],
        memberships: [],
        agents: [],
        policies: [],
        bindings: [],
      };

      writeState(this.dataDir, state);
    }
  }
}

export function createFileDataStore(dataDir: string): DataStore {
  return new FileDataStore(dataDir);
}
