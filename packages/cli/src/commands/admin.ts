import {
  resolveSystemRoles,
  SystemRole as SystemRoleEnum,
} from '@openleash/core';
import type { DataStore, UserFrontmatter, SystemRole } from '@openleash/core';
import { bootstrapState } from '@openleash/server';

function ensureBootstrapped(store: DataStore): void {
  bootstrapState(process.cwd(), store);
}

function findUser(store: DataStore, identifier: string): UserFrontmatter | null {
  const state = store.state.getState();
  const normalized = identifier.toLowerCase();
  for (const entry of state.users) {
    try {
      const user = store.users.read(entry.user_principal_id);
      if (user.user_principal_id === identifier) return user;
      const matched = user.contact_identities?.some(
        (ci) => ci.type === 'EMAIL' && ci.value.toLowerCase() === normalized,
      );
      if (matched) return user;
    } catch {
      // Skip unreadable entries
    }
  }
  return null;
}

function primaryEmail(user: UserFrontmatter): string | null {
  const e = user.contact_identities?.find((ci) => ci.type === 'EMAIL');
  return e ? e.value : null;
}

export async function adminListCommand(store: DataStore): Promise<void> {
  ensureBootstrapped(store);
  const state = store.state.getState();
  if (state.users.length === 0) {
    console.log('No users registered.');
    return;
  }

  console.log(`\n  ${'ID'.padEnd(38)} ${'Email'.padEnd(32)} ${'Name'.padEnd(24)} Roles`);
  console.log(`  ${'-'.repeat(38)} ${'-'.repeat(32)} ${'-'.repeat(24)} ${'-'.repeat(10)}`);
  for (const entry of state.users) {
    try {
      const user = store.users.read(entry.user_principal_id);
      const roles = resolveSystemRoles(user);
      const email = primaryEmail(user) ?? '-';
      console.log(
        `  ${user.user_principal_id} ${email.padEnd(32)} ${(user.display_name ?? '-').padEnd(24)} ${roles.join(',') || '-'}`,
      );
    } catch {
      console.log(`  ${entry.user_principal_id} (file not found)`);
    }
  }
  console.log();
}

export async function adminGrantCommand(store: DataStore, identifier: string | undefined): Promise<void> {
  if (!identifier) {
    console.log('Usage: openleash admin grant <user-principal-id-or-email>');
    return;
  }
  ensureBootstrapped(store);

  const user = findUser(store, identifier);
  if (!user) {
    console.error(`No user found matching "${identifier}".`);
    process.exit(1);
  }

  const previous = resolveSystemRoles(user);
  if (previous.includes('admin')) {
    console.log(`User ${user.user_principal_id} (${primaryEmail(user) ?? user.display_name}) already has admin role.`);
    return;
  }

  const next: SystemRole[] = [...previous, SystemRoleEnum.parse('admin')];
  user.system_roles = next;
  store.users.write(user);

  store.audit.append(
    'USER_UPDATED',
    {
      user_principal_id: user.user_principal_id,
      previous_system_roles: previous,
      new_system_roles: next,
      source: 'cli',
    },
    { principal_id: null },
  );

  console.log(`Granted admin role to ${user.user_principal_id} (${primaryEmail(user) ?? user.display_name}).`);
}

export async function adminRevokeCommand(store: DataStore, identifier: string | undefined): Promise<void> {
  if (!identifier) {
    console.log('Usage: openleash admin revoke <user-principal-id-or-email>');
    return;
  }
  ensureBootstrapped(store);

  const user = findUser(store, identifier);
  if (!user) {
    console.error(`No user found matching "${identifier}".`);
    process.exit(1);
  }

  const previous = resolveSystemRoles(user);
  if (!previous.includes('admin')) {
    console.log(`User ${user.user_principal_id} does not have admin role.`);
    return;
  }

  const next = previous.filter((r) => r !== 'admin');
  user.system_roles = next;
  store.users.write(user);

  store.audit.append(
    'USER_UPDATED',
    {
      user_principal_id: user.user_principal_id,
      previous_system_roles: previous,
      new_system_roles: next,
      source: 'cli',
    },
    { principal_id: null },
  );

  console.log(`Revoked admin role from ${user.user_principal_id} (${primaryEmail(user) ?? user.display_name}).`);
}
