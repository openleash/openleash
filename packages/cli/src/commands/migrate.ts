import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  UserFrontmatter,
  OrganizationFrontmatter,
  OrgMembership,
  StateData,
} from '@openleash/core';
import { slugifyName, ensureUniqueSlug } from '@openleash/core';

// ─── V1 types (no longer in core) ─────────────────────────────────

interface V1OwnerFrontmatter {
  owner_principal_id: string;
  principal_type: 'HUMAN' | 'ORG';
  display_name: string;
  status: string;
  attributes: Record<string, unknown>;
  created_at: string;
  identity_assurance_level?: string;
  contact_identities?: unknown[];
  government_ids?: unknown[];
  company_ids?: unknown[];
  signatories?: Array<{
    signatory_id: string;
    human_owner_principal_id: string;
    role: string;
    signing_authority: string;
    scope_description?: string;
    valid_from?: string;
    valid_until: string | null;
    added_at: string;
  }>;
  signatory_rules?: unknown[];
  passphrase_hash?: string;
  passphrase_salt?: string;
  passphrase_set_at?: string;
  external_auth_provider?: string;
  external_auth_id?: string;
  roles?: string[];
  totp_secret_b32?: string;
  totp_enabled?: boolean;
  totp_enabled_at?: string;
  totp_backup_codes_hash?: string[];
}

interface V1StateData {
  version: 1;
  created_at: string;
  server_keys: {
    active_kid: string;
    keys: Array<{ kid: string; path: string }>;
  };
  owners: Array<{ owner_principal_id: string; path: string }>;
  agents: Array<{
    agent_principal_id: string;
    agent_id: string;
    owner_principal_id: string;
    path: string;
  }>;
  policies: Array<{
    policy_id: string;
    owner_principal_id: string;
    applies_to_agent_principal_id: string | null;
    name: string | null;
    description: string | null;
    path: string;
  }>;
  bindings: Array<{
    owner_principal_id: string;
    policy_id: string;
    applies_to_agent_principal_id: string | null;
  }>;
  approval_requests?: Array<{
    approval_request_id: string;
    owner_principal_id: string;
    agent_principal_id: string;
    status: string;
    path: string;
  }>;
  policy_drafts?: Array<{
    policy_draft_id: string;
    owner_principal_id: string;
    agent_principal_id: string;
    status: string;
    path: string;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('No frontmatter found');
  return parseYaml(match[1]) as Record<string, unknown>;
}

function writeFrontmatterFile(filePath: string, data: Record<string, unknown>, body: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = stringifyYaml(data, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\n${body}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeState(dataDir: string, state: StateData): void {
  const filePath = path.join(dataDir, 'state.md');
  const frontmatter = stringifyYaml(state as unknown as Record<string, unknown>, { lineWidth: 0 }).trim();
  const content = `---\n${frontmatter}\n---\n\nOpenLeash state file.\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Migration logic ────────────────────────────────────────────────

interface MigrationPlan {
  usersToCreate: UserFrontmatter[];
  orgsToCreate: OrganizationFrontmatter[];
  membershipsToCreate: OrgMembership[];
  agentsToUpdate: Array<{ agent_principal_id: string; owner_type: 'user' | 'org'; owner_id: string }>;
  newState: StateData;
  warnings: string[];
}

function resolveOwnerType(ownerId: string, ownerMap: Map<string, V1OwnerFrontmatter>): 'user' | 'org' {
  const owner = ownerMap.get(ownerId);
  if (!owner) return 'user'; // default assumption
  return owner.principal_type === 'ORG' ? 'org' : 'user';
}

function planMigration(dataDir: string): MigrationPlan {
  const statePath = path.join(dataDir, 'state.md');
  if (!fs.existsSync(statePath)) {
    throw new Error(`State file not found: ${statePath}`);
  }

  const stateContent = fs.readFileSync(statePath, 'utf-8');
  const oldState = parseFrontmatter(stateContent) as unknown as V1StateData;

  if ((oldState.version as number) === 2) {
    throw new Error('Data is already v2. No migration needed.');
  }
  if ((oldState.version as number) !== 1) {
    throw new Error(`Unknown state version: ${oldState.version}. Expected 1.`);
  }

  const warnings: string[] = [];
  const ownerMap = new Map<string, V1OwnerFrontmatter>();

  // Read all existing owner files
  for (const entry of oldState.owners) {
    const ownerPath = path.join(dataDir, 'owners', `${entry.owner_principal_id}.md`);
    if (!fs.existsSync(ownerPath)) {
      warnings.push(`Owner file not found: ${ownerPath} — skipping`);
      continue;
    }
    const content = fs.readFileSync(ownerPath, 'utf-8');
    const owner = parseFrontmatter(content) as unknown as V1OwnerFrontmatter;
    ownerMap.set(entry.owner_principal_id, owner);
  }

  // Categorize owners
  const usersToCreate: UserFrontmatter[] = [];
  const orgsToCreate: OrganizationFrontmatter[] = [];
  const membershipsToCreate: OrgMembership[] = [];

  for (const [id, owner] of ownerMap) {
    if (owner.principal_type === 'HUMAN') {
      const user: UserFrontmatter = {
        user_principal_id: id,
        display_name: owner.display_name,
        status: owner.status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
        attributes: owner.attributes ?? {},
        created_at: owner.created_at,
        identity_assurance_level: owner.identity_assurance_level as UserFrontmatter['identity_assurance_level'],
        contact_identities: owner.contact_identities as UserFrontmatter['contact_identities'],
        government_ids: owner.government_ids as UserFrontmatter['government_ids'],
        passphrase_hash: owner.passphrase_hash,
        passphrase_salt: owner.passphrase_salt,
        passphrase_set_at: owner.passphrase_set_at,
        external_auth_provider: owner.external_auth_provider,
        external_auth_id: owner.external_auth_id,
        system_roles: (owner.roles ?? []).includes('admin') ? ['admin'] : undefined,
        totp_secret_b32: owner.totp_secret_b32,
        totp_enabled: owner.totp_enabled,
        totp_enabled_at: owner.totp_enabled_at,
        totp_backup_codes_hash: owner.totp_backup_codes_hash,
      };
      usersToCreate.push(user);
    } else {
      // ORG → Organization
      // Find the first human signatory to use as created_by
      const signatories = owner.signatories ?? [];
      const firstHumanId = signatories[0]?.human_owner_principal_id ?? null;

      if (!firstHumanId) {
        warnings.push(
          `ORG ${id} (${owner.display_name}) has no signatories. ` +
          `No org_admin membership will be created. You should manually assign an admin.`
        );
      }

      const slug = ensureUniqueSlug(
        slugifyName(owner.display_name),
        new Set(orgsToCreate.map((o) => o.slug).filter(Boolean) as string[]),
      );
      const org: OrganizationFrontmatter = {
        org_id: id,
        slug,
        display_name: owner.display_name,
        status: owner.status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
        attributes: owner.attributes ?? {},
        created_at: owner.created_at,
        created_by_user_id: firstHumanId ?? 'unknown',
        identity_assurance_level: owner.identity_assurance_level as OrganizationFrontmatter['identity_assurance_level'],
        contact_identities: owner.contact_identities as OrganizationFrontmatter['contact_identities'],
        company_ids: owner.company_ids as OrganizationFrontmatter['company_ids'],
        signatories: owner.signatories as OrganizationFrontmatter['signatories'],
        signatory_rules: owner.signatory_rules as OrganizationFrontmatter['signatory_rules'],
        verification_status: 'unverified',
      };
      orgsToCreate.push(org);

      // Create memberships for each unique signatory
      const seenSignatoryIds = new Set<string>();
      for (const sig of signatories) {
        if (seenSignatoryIds.has(sig.human_owner_principal_id)) continue;
        seenSignatoryIds.add(sig.human_owner_principal_id);

        const humanOwner = ownerMap.get(sig.human_owner_principal_id);
        if (!humanOwner) {
          warnings.push(
            `Signatory ${sig.human_owner_principal_id} for ORG ${id} not found in owners. ` +
            `Membership will reference a non-existent user.`
          );
        }

        membershipsToCreate.push({
          membership_id: crypto.randomUUID(),
          org_id: id,
          user_principal_id: sig.human_owner_principal_id,
          role: 'org_admin',
          status: 'active',
          invited_by_user_id: null,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // Plan agent updates
  const agentsToUpdate = oldState.agents.map((a) => ({
    agent_principal_id: a.agent_principal_id,
    owner_type: resolveOwnerType(a.owner_principal_id, ownerMap),
    owner_id: a.owner_principal_id,
  }));

  // Build new state
  const newState: StateData = {
    version: 2,
    created_at: oldState.created_at,
    server_keys: oldState.server_keys,
    users: usersToCreate.map((u) => ({
      user_principal_id: u.user_principal_id,
      path: `./users/${u.user_principal_id}.md`,
    })),
    organizations: orgsToCreate.map((o) => ({
      org_id: o.org_id,
      slug: o.slug,
      path: `./organizations/${o.org_id}.md`,
    })),
    memberships: membershipsToCreate.map((m) => ({
      membership_id: m.membership_id,
      org_id: m.org_id,
      user_principal_id: m.user_principal_id,
      role: m.role,
      path: `./memberships/${m.membership_id}.md`,
    })),
    agents: agentsToUpdate.map((a) => ({
      agent_principal_id: a.agent_principal_id,
      agent_id: oldState.agents.find((x) => x.agent_principal_id === a.agent_principal_id)!.agent_id,
      owner_type: a.owner_type,
      owner_id: a.owner_id,
      path: `./agents/${a.agent_principal_id}.md`,
    })),
    policies: oldState.policies.map((p) => ({
      policy_id: p.policy_id,
      owner_type: resolveOwnerType(p.owner_principal_id, ownerMap),
      owner_id: p.owner_principal_id,
      applies_to_agent_principal_id: p.applies_to_agent_principal_id,
      name: p.name,
      description: p.description,
      path: p.path,
    })),
    bindings: oldState.bindings.map((b) => ({
      owner_type: resolveOwnerType(b.owner_principal_id, ownerMap),
      owner_id: b.owner_principal_id,
      policy_id: b.policy_id,
      applies_to_agent_principal_id: b.applies_to_agent_principal_id,
    })),
  };

  // Migrate approval requests and policy drafts if present
  if (oldState.approval_requests?.length) {
    newState.approval_requests = oldState.approval_requests.map((r) => ({
      approval_request_id: r.approval_request_id,
      owner_type: resolveOwnerType(r.owner_principal_id, ownerMap),
      owner_id: r.owner_principal_id,
      agent_principal_id: r.agent_principal_id,
      status: r.status as 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED',
      path: r.path,
    }));
  }

  if (oldState.policy_drafts?.length) {
    newState.policy_drafts = oldState.policy_drafts.map((d) => ({
      policy_draft_id: d.policy_draft_id,
      owner_type: resolveOwnerType(d.owner_principal_id, ownerMap),
      owner_id: d.owner_principal_id,
      agent_principal_id: d.agent_principal_id,
      status: d.status as 'PENDING' | 'APPROVED' | 'DENIED',
      path: d.path,
    }));
  }

  return { usersToCreate, orgsToCreate, membershipsToCreate, agentsToUpdate, newState, warnings };
}

function applyMigration(dataDir: string, plan: MigrationPlan): void {
  // Create new directories
  fs.mkdirSync(path.join(dataDir, 'users'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'organizations'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'memberships'), { recursive: true });

  // Write user files
  for (const user of plan.usersToCreate) {
    writeFrontmatterFile(
      path.join(dataDir, 'users', `${user.user_principal_id}.md`),
      user as unknown as Record<string, unknown>,
      `User: ${user.display_name}`,
    );
  }

  // Write organization files
  for (const org of plan.orgsToCreate) {
    writeFrontmatterFile(
      path.join(dataDir, 'organizations', `${org.org_id}.md`),
      org as unknown as Record<string, unknown>,
      `Organization: ${org.display_name}`,
    );
  }

  // Write membership files
  for (const m of plan.membershipsToCreate) {
    writeFrontmatterFile(
      path.join(dataDir, 'memberships', `${m.membership_id}.md`),
      m as unknown as Record<string, unknown>,
      `Membership: ${m.user_principal_id} in ${m.org_id}`,
    );
  }

  // Update agent files in-place
  for (const agentUpdate of plan.agentsToUpdate) {
    const agentPath = path.join(dataDir, 'agents', `${agentUpdate.agent_principal_id}.md`);
    if (!fs.existsSync(agentPath)) continue;

    const content = fs.readFileSync(agentPath, 'utf-8');
    const data = parseFrontmatter(content) as Record<string, unknown>;

    // Remove old field, add new fields
    delete data.owner_principal_id;
    data.owner_type = agentUpdate.owner_type;
    data.owner_id = agentUpdate.owner_id;

    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
    const body = bodyMatch?.[1]?.trim() || `Agent: ${data.agent_id}`;
    writeFrontmatterFile(agentPath, data, body);
  }

  // Update approval request files in-place
  const arDir = path.join(dataDir, 'approval-requests');
  if (fs.existsSync(arDir)) {
    for (const file of fs.readdirSync(arDir).filter((f) => f.endsWith('.md'))) {
      const filePath = path.join(arDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = parseFrontmatter(content) as Record<string, unknown>;

      if ('owner_principal_id' in data) {
        const ownerId = data.owner_principal_id as string;
        delete data.owner_principal_id;
        // Determine type from the migration plan
        const agentUpdate = plan.agentsToUpdate.find((a) => a.owner_id === ownerId);
        data.owner_type = agentUpdate?.owner_type ?? 'user';
        data.owner_id = ownerId;

        const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
        const body = bodyMatch?.[1]?.trim() || '';
        writeFrontmatterFile(filePath, data, body);
      }
    }
  }

  // Update policy draft files in-place
  const pdDir = path.join(dataDir, 'policy-drafts');
  if (fs.existsSync(pdDir)) {
    for (const file of fs.readdirSync(pdDir).filter((f) => f.endsWith('.md'))) {
      const filePath = path.join(pdDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = parseFrontmatter(content) as Record<string, unknown>;

      if ('owner_principal_id' in data) {
        const ownerId = data.owner_principal_id as string;
        delete data.owner_principal_id;
        const agentUpdate = plan.agentsToUpdate.find((a) => a.owner_id === ownerId);
        data.owner_type = agentUpdate?.owner_type ?? 'user';
        data.owner_id = ownerId;

        const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
        const body = bodyMatch?.[1]?.trim() || '';
        writeFrontmatterFile(filePath, data, body);
      }
    }
  }

  // Write new state
  writeState(dataDir, plan.newState);

  // Remove old owners directory
  const ownersDir = path.join(dataDir, 'owners');
  if (fs.existsSync(ownersDir)) {
    fs.rmSync(ownersDir, { recursive: true });
  }
}

// ─── CLI entry point ────────────────────────────────────────────────

export async function migrateCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  if (subcommand !== 'v2') {
    console.log('Usage: openleash migrate v2 [--apply]');
    console.log('  Migrates data from v1 (owners) to v2 (users + organizations).');
    console.log('  By default runs a dry-run. Use --apply to execute the migration.');
    return;
  }

  const apply = args.includes('--apply');
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');

  if (!fs.existsSync(dataDir)) {
    console.error('Error: data directory not found at', dataDir);
    process.exit(1);
  }

  console.log(apply ? 'Running migration v1 → v2...' : 'Dry-run migration v1 → v2 (use --apply to execute)...');
  console.log();

  let plan: MigrationPlan;
  try {
    plan = planMigration(dataDir);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }

  // Print plan
  console.log(`Users to create:         ${plan.usersToCreate.length}`);
  for (const u of plan.usersToCreate) {
    console.log(`  - ${u.display_name} (${u.user_principal_id})${u.system_roles?.includes('admin') ? ' [admin]' : ''}`);
  }

  console.log(`Organizations to create: ${plan.orgsToCreate.length}`);
  for (const o of plan.orgsToCreate) {
    console.log(`  - ${o.display_name} (${o.org_id})`);
  }

  console.log(`Memberships to create:   ${plan.membershipsToCreate.length}`);
  for (const m of plan.membershipsToCreate) {
    console.log(`  - user ${m.user_principal_id} → org ${m.org_id} (${m.role})`);
  }

  console.log(`Agents to update:        ${plan.agentsToUpdate.length}`);
  for (const a of plan.agentsToUpdate) {
    console.log(`  - ${a.agent_principal_id} → owner_type=${a.owner_type}, owner_id=${a.owner_id}`);
  }

  if (plan.warnings.length > 0) {
    console.log();
    console.log('Warnings:');
    for (const w of plan.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  if (!apply) {
    console.log();
    console.log('Dry-run complete. No changes made. Run with --apply to execute.');
    return;
  }

  // Apply migration
  console.log();
  console.log('Applying migration...');
  applyMigration(dataDir, plan);
  console.log('Migration complete.');
  console.log('  - Created users/, organizations/, memberships/ directories');
  console.log('  - Updated agent files with owner_type/owner_id');
  console.log('  - Updated approval-requests and policy-drafts');
  console.log('  - Rewrote state.md (version 2)');
  console.log('  - Removed owners/ directory');
}
