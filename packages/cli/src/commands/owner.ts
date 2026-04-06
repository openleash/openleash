import * as crypto from 'node:crypto';
import prompts from 'prompts';
import {
  validateGovernmentIdValue,
  validateCompanyIdValue,
  validateUserIdentity,
  validateOrgIdentity,
  computeUserAssuranceLevel,
  computeOrgAssuranceLevel,
  EU_PERSONAL_ID_TYPES,
  EuCountryCode,
} from '@openleash/core';
import type { DataStore, UserFrontmatter, OrganizationFrontmatter, ContactIdentity, GovernmentId, CompanyId, Signatory } from '@openleash/core';
import { bootstrapState } from '@openleash/server';

const EU_COUNTRIES = EuCountryCode.options;

function ensureBootstrapped(store: DataStore): void {
  const rootDir = process.cwd();
  bootstrapState(rootDir, store);
}

export async function ownerListCommand(store: DataStore) {
  ensureBootstrapped(store);
  const state = store.state.getState();
  if (state.users.length === 0) {
    console.log('No owners registered.');
    return;
  }
  console.log(`\n  ${'ID'.padEnd(38)} ${'Name'.padEnd(24)} ${'Status'.padEnd(10)} Assurance`);
  console.log(`  ${'-'.repeat(38)} ${'-'.repeat(24)} ${'-'.repeat(10)} ${'-'.repeat(15)}`);
  for (const entry of state.users) {
    try {
      const o = store.users.read(entry.user_principal_id);
      console.log(`  ${o.user_principal_id} ${(o.display_name ?? '-').padEnd(24)} ${(o.status ?? '-').padEnd(10)} ${o.identity_assurance_level ?? 'NONE'}`);
    } catch {
      console.log(`  ${entry.user_principal_id} (file not found)`);
    }
  }
  console.log();
}

export async function ownerShowCommand(store: DataStore, ownerId: string) {
  if (!ownerId) {
    console.log('Usage: openleash owner show <owner-principal-id>');
    return;
  }
  ensureBootstrapped(store);
  try {
    const user = store.users.read(ownerId);
    console.log(`\n  Owner: ${user.display_name}`);
    console.log(`  ID:    ${user.user_principal_id}`);
    console.log(`  Status: ${user.status}`);
    console.log(`  Assurance: ${user.identity_assurance_level ?? 'NONE'}`);
    console.log(`  Created: ${user.created_at}`);

    if (user.contact_identities?.length) {
      console.log(`\n  Contact Identities:`);
      for (const c of user.contact_identities) {
        console.log(`    ${c.type}: ${c.value}${c.label ? ` (${c.label})` : ''} [${c.verified ? 'VERIFIED' : 'UNVERIFIED'}]`);
      }
    }

    if (user.government_ids?.length) {
      console.log(`\n  Government IDs:`);
      for (const g of user.government_ids) {
        const masked = g.id_value.length > 4 ? '*'.repeat(g.id_value.length - 4) + g.id_value.slice(-4) : g.id_value;
        console.log(`    ${g.country}/${g.id_type}: ${masked} [${g.verification_level}]`);
      }
    }

    console.log();
  } catch {
    console.error(`Owner ${ownerId} not found.`);
  }
}

export async function ownerAddContactCommand(store: DataStore, ownerId: string) {
  if (!ownerId) {
    console.log('Usage: openleash owner add-contact <owner-principal-id>');
    return;
  }
  ensureBootstrapped(store);
  const user = store.users.read(ownerId);

  const { type } = await prompts({
    type: 'select',
    name: 'type',
    message: 'Contact type:',
    choices: [
      { title: 'Email', value: 'EMAIL' },
      { title: 'Phone', value: 'PHONE' },
      { title: 'Instant Message', value: 'INSTANT_MESSAGE' },
      { title: 'Social Media', value: 'SOCIAL_MEDIA' },
    ],
  });

  const { value } = await prompts({
    type: 'text',
    name: 'value',
    message: type === 'EMAIL' ? 'Email address:' : type === 'PHONE' ? 'Phone number:' : 'Handle/URL:',
  });

  const { label } = await prompts({
    type: 'text',
    name: 'label',
    message: 'Label (optional, e.g. "Work"):',
  });

  let platform: string | undefined;
  if (type === 'INSTANT_MESSAGE' || type === 'SOCIAL_MEDIA') {
    const { platformInput } = await prompts({
      type: 'text',
      name: 'platformInput',
      message: 'Platform (e.g. SIGNAL, LINKEDIN):',
    });
    platform = platformInput || undefined;
  }

  const contact: ContactIdentity = {
    contact_id: crypto.randomUUID(),
    type,
    value,
    ...(label && { label }),
    ...(platform && { platform }),
    verified: false,
    verified_at: null,
    added_at: new Date().toISOString(),
  };

  user.contact_identities = [...(user.contact_identities ?? []), contact];
  user.identity_assurance_level = computeUserAssuranceLevel(user);
  store.users.write(user);
  store.audit.append('USER_IDENTITY_UPDATED', { user_principal_id: ownerId, action: 'add_contact' });
  console.log(`  Contact added: ${type} ${value}`);
}

export async function ownerAddGovIdCommand(store: DataStore, ownerId: string) {
  if (!ownerId) {
    console.log('Usage: openleash owner add-gov-id <owner-principal-id>');
    return;
  }
  ensureBootstrapped(store);
  const user = store.users.read(ownerId);

  const { country } = await prompts({
    type: 'select',
    name: 'country',
    message: 'Country:',
    choices: EU_COUNTRIES.map((c) => ({
      title: `${c} — ${EU_PERSONAL_ID_TYPES[c]?.join(', ') ?? 'Unknown'}`,
      value: c,
    })),
  });

  const knownTypes = EU_PERSONAL_ID_TYPES[country] ?? [];
  let idType: string;
  if (knownTypes.length === 1) {
    idType = knownTypes[0];
    console.log(`  ID type: ${idType}`);
  } else {
    const { idTypeInput } = await prompts({
      type: 'select',
      name: 'idTypeInput',
      message: 'ID type:',
      choices: knownTypes.map((t) => ({ title: t, value: t })),
    });
    idType = idTypeInput;
  }

  const { idValue } = await prompts({
    type: 'text',
    name: 'idValue',
    message: `Enter ${idType}:`,
  });

  const result = validateGovernmentIdValue(country, idType, idValue);
  const verificationLevel = result.valid ? 'FORMAT_VALID' : 'UNVERIFIED';

  if (!result.valid) {
    console.log(`  Warning: Format validation failed — ${result.error}`);
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Add anyway?',
      initial: false,
    });
    if (!proceed) return;
  } else {
    console.log(`  Format validation passed.`);
  }

  // Check for duplicates
  const existing = (user.government_ids ?? []).find(
    (g) => g.country === country && g.id_type === idType,
  );
  if (existing) {
    console.error(`  A ${idType} for ${country} already exists. Remove it first.`);
    return;
  }

  const govId: GovernmentId = {
    country,
    id_type: idType,
    id_value: idValue,
    verification_level: verificationLevel,
    verified_at: null,
    added_at: new Date().toISOString(),
  };

  user.government_ids = [...(user.government_ids ?? []), govId];
  user.identity_assurance_level = computeUserAssuranceLevel(user);
  store.users.write(user);
  store.audit.append('USER_IDENTITY_UPDATED', { user_principal_id: ownerId, action: 'add_government_id', country, id_type: idType });
  console.log(`  Government ID added: ${country}/${idType} [${verificationLevel}]`);
}

export async function ownerAddCompanyIdCommand(store: DataStore, ownerId: string) {
  if (!ownerId) {
    console.log('Usage: openleash owner add-company-id <owner-principal-id>');
    return;
  }
  ensureBootstrapped(store);
  const org = store.organizations.read(ownerId);

  const { idType } = await prompts({
    type: 'select',
    name: 'idType',
    message: 'ID type:',
    choices: [
      { title: 'Company Registration Number', value: 'COMPANY_REG' },
      { title: 'VAT Number', value: 'VAT' },
      { title: 'EORI Number', value: 'EORI' },
      { title: 'LEI (Legal Entity Identifier)', value: 'LEI' },
      { title: 'DUNS Number', value: 'DUNS' },
    ],
  });

  let country: string | undefined;
  if (idType === 'COMPANY_REG' || idType === 'VAT') {
    const { countryInput } = await prompts({
      type: 'select',
      name: 'countryInput',
      message: 'Country:',
      choices: EU_COUNTRIES.map((c) => ({ title: c, value: c })),
    });
    country = countryInput;
  }

  const { idValue } = await prompts({
    type: 'text',
    name: 'idValue',
    message: `Enter ${idType}${country ? ` (${country})` : ''}:`,
  });

  const result = validateCompanyIdValue(idType, idValue, country as 'SE' | undefined);
  const verificationLevel = result.valid ? 'FORMAT_VALID' : 'UNVERIFIED';

  if (!result.valid) {
    console.log(`  Warning: Format validation failed — ${result.error}`);
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Add anyway?',
      initial: false,
    });
    if (!proceed) return;
  } else {
    console.log(`  Format validation passed.`);
  }

  const companyId: CompanyId = {
    id_type: idType,
    ...(country && { country: country as 'SE' }),
    id_value: idValue,
    verification_level: verificationLevel,
    verified_at: null,
    added_at: new Date().toISOString(),
  };

  org.company_ids = [...(org.company_ids ?? []), companyId];
  org.identity_assurance_level = computeOrgAssuranceLevel(org);
  store.organizations.write(org);
  store.audit.append('ORG_UPDATED', { org_id: ownerId, action: 'add_company_id', id_type: idType });
  console.log(`  Company ID added: ${idType} [${verificationLevel}]`);
}

export async function ownerAddSignatoryCommand(store: DataStore, ownerId: string) {
  if (!ownerId) {
    console.log('Usage: openleash owner add-signatory <owner-principal-id>');
    return;
  }
  ensureBootstrapped(store);
  const org = store.organizations.read(ownerId);

  const state = store.state.getState();
  const humanUsers = state.users
    .map((o) => { try { return store.users.read(o.user_principal_id); } catch { return null; } })
    .filter((o): o is UserFrontmatter => o !== null);

  if (humanUsers.length === 0) {
    console.error('No users found. Create a user first.');
    return;
  }

  const { humanId } = await prompts({
    type: 'select',
    name: 'humanId',
    message: 'Select person:',
    choices: humanUsers.map((h) => ({
      title: `${h.display_name} (${h.user_principal_id.slice(0, 8)}...)`,
      value: h.user_principal_id,
    })),
  });

  const { role } = await prompts({
    type: 'select',
    name: 'role',
    message: 'Role:',
    choices: [
      { title: 'CEO', value: 'CEO' },
      { title: 'Board Chairman', value: 'BOARD_CHAIRMAN' },
      { title: 'Board Member', value: 'BOARD_MEMBER' },
      { title: 'Authorized Signatory', value: 'AUTHORIZED_SIGNATORY' },
      { title: 'Procurator', value: 'PROCURATOR' },
      { title: 'Managing Director', value: 'MANAGING_DIRECTOR' },
      { title: 'Other', value: 'OTHER' },
    ],
  });

  const { authority } = await prompts({
    type: 'select',
    name: 'authority',
    message: 'Signing authority:',
    choices: [
      { title: 'SOLE — Can sign alone', value: 'SOLE' },
      { title: 'JOINT — Must co-sign with another', value: 'JOINT' },
    ],
  });

  const { scope } = await prompts({
    type: 'text',
    name: 'scope',
    message: 'Scope description (optional):',
  });

  const signatory: Signatory = {
    signatory_id: crypto.randomUUID(),
    human_owner_principal_id: humanId,
    role,
    signing_authority: authority,
    ...(scope && { scope_description: scope }),
    valid_until: null,
    added_at: new Date().toISOString(),
  };

  org.signatories = [...(org.signatories ?? []), signatory];
  store.organizations.write(org);
  store.audit.append('ORG_UPDATED', { org_id: ownerId, action: 'add_signatory', human_owner_principal_id: humanId, role });
  console.log(`  Signatory added: ${humanUsers.find((h) => h.user_principal_id === humanId)?.display_name} as ${role} (${authority})`);
}

export async function ownerValidateCommand(store: DataStore, ownerId: string) {
  if (!ownerId) {
    console.log('Usage: openleash owner validate <owner-principal-id>');
    return;
  }
  ensureBootstrapped(store);

  // Try reading as a user first
  let user: UserFrontmatter | null = null;
  try {
    user = store.users.read(ownerId);
  } catch { /* not a user */ }

  if (user) {
    const result = validateUserIdentity(user);
    let hasErrors = false;

    if (result.type_errors.length > 0) {
      console.log('\n  Type errors:');
      for (const e of result.type_errors) console.log(`    - ${e}`);
      hasErrors = true;
    }

    for (const [i, r] of result.contacts.entries()) {
      if (!r.valid) {
        console.log(`  Contact #${i + 1}: ${r.error}`);
        hasErrors = true;
      }
    }

    for (const [i, r] of result.government_ids.entries()) {
      if (!r.valid) {
        console.log(`  Government ID #${i + 1}: ${r.error}`);
        hasErrors = true;
      }
    }

    if (!hasErrors) {
      console.log(`\n  All identity checks passed.`);
    }

    console.log(`  Identity assurance level: ${computeUserAssuranceLevel(user)}`);
    return;
  }

  // Try as org
  let org: OrganizationFrontmatter | null = null;
  try {
    org = store.organizations.read(ownerId);
  } catch { /* not an org */ }

  if (org) {
    const resolveUser = (id: string): UserFrontmatter | null => {
      try { return store.users.read(id); } catch { return null; }
    };

    const result = validateOrgIdentity(org, resolveUser);
    let hasErrors = false;

    if (result.type_errors.length > 0) {
      console.log('\n  Type errors:');
      for (const e of result.type_errors) console.log(`    - ${e}`);
      hasErrors = true;
    }

    for (const [i, r] of result.contacts.entries()) {
      if (!r.valid) {
        console.log(`  Contact #${i + 1}: ${r.error}`);
        hasErrors = true;
      }
    }

    for (const [i, r] of result.company_ids.entries()) {
      if (!r.valid) {
        console.log(`  Company ID #${i + 1}: ${r.error}`);
        hasErrors = true;
      }
    }

    for (const [i, r] of result.signatories.entries()) {
      if (!r.valid) {
        console.log(`  Signatory #${i + 1}: ${r.error}`);
        hasErrors = true;
      }
    }

    if (!hasErrors) {
      console.log(`\n  All identity checks passed.`);
    }

    console.log(`  Identity assurance level: ${computeOrgAssuranceLevel(org)}`);
    return;
  }

  console.error(`Owner ${ownerId} not found.`);
}
