import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readState,
  writeState,
  writeOwnerFile,
  readOwnerFile,
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
  OwnerFrontmatter,
  PolicyDraftFrontmatter,
  ServerKeyFile,
  SetupInvite,
  StateApprovalRequestEntry,
  StateData,
} from './types.js';
import type {
  DataStore,
  OwnerRepository,
  AgentRepository,
  PolicyRepository,
  ApprovalRequestRepository,
  PolicyDraftRepository,
  SetupInviteRepository,
  AgentInviteRepository,
  KeyRepository,
  StateRepository,
} from './store.js';

// ─── File-based repository implementations ──────────────────────────

class FileOwnerRepository implements OwnerRepository {
  constructor(private readonly dataDir: string) {}

  read(ownerPrincipalId: string): OwnerFrontmatter {
    return readOwnerFile(this.dataDir, ownerPrincipalId);
  }

  write(owner: OwnerFrontmatter, body?: string): void {
    writeOwnerFile(this.dataDir, owner, body);
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
    ownerId: string,
    limit: number,
    offset: number,
  ): { items: StateApprovalRequestEntry[]; total: number } {
    return this.stateIndex.getResolvedApprovals(ownerId, limit, offset);
  }
}

// ─── FileDataStore ──────────────────────────────────────────────────

export class FileDataStore implements DataStore {
  readonly owners: OwnerRepository;
  readonly agents: AgentRepository;
  readonly policies: PolicyRepository;
  readonly approvalRequests: ApprovalRequestRepository;
  readonly policyDrafts: PolicyDraftRepository;
  readonly setupInvites: SetupInviteRepository;
  readonly agentInvites: AgentInviteRepository;
  readonly keys: KeyRepository;
  readonly state: StateRepository;
  readonly audit: AuditStore;

  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.owners = new FileOwnerRepository(dataDir);
    this.agents = new FileAgentRepository(dataDir);
    this.policies = new FilePolicyRepository(dataDir);
    this.approvalRequests = new FileApprovalRequestRepository(dataDir);
    this.policyDrafts = new FilePolicyDraftRepository(dataDir);
    this.setupInvites = new FileSetupInviteRepository(dataDir);
    this.agentInvites = new FileAgentInviteRepository(dataDir);
    this.keys = new FileKeyRepository(dataDir);
    this.state = new FileStateRepository(dataDir);
    this.audit = new FileAuditStore(dataDir);
  }

  initialize(): void {
    // Ensure data directories
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'keys'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'owners'), { recursive: true });
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
        version: 1,
        created_at: new Date().toISOString(),
        server_keys: {
          active_kid: key.kid,
          keys: [{ kid: key.kid, path: `./keys/${key.kid}.json` }],
        },
        owners: [],
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
