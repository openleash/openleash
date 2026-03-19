import { z } from 'zod';
import {
  EU_PERSONAL_ID_VALIDATORS,
  EU_PERSONAL_ID_TYPES,
  validateVAT,
  validateLEI,
  validateDUNS,
  validateEORI,
  validateCompanyReg,
  type ValidationResult,
} from './identity-validators.js';
import type { OwnerFrontmatter } from './types.js';

// ─── EU country codes ───────────────────────────────────────────────

export const EuCountryCode = z.enum([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);
export type EuCountryCode = z.infer<typeof EuCountryCode>;

// ─── Verification proof ─────────────────────────────────────────────

export const VerificationProofSchema = z.object({
  provider: z.string(),                // "bankid", "bolagsverket", "sms-otp", "email-otp"
  verified_by: z.string().optional(),   // "BankID RP v6", "Bolagsverket API"
  reference_id: z.string().optional(),  // Provider transaction/order ID
  proof_data: z.record(z.string(), z.unknown()).optional(), // Provider-specific proof
});
export type VerificationProof = z.infer<typeof VerificationProofSchema>;

// ─── Verification levels ────────────────────────────────────────────

export const VerificationLevel = z.enum([
  'UNVERIFIED',
  'FORMAT_VALID',
  'VERIFIED',
]);
export type VerificationLevel = z.infer<typeof VerificationLevel>;

// ─── Identity assurance level (computed, owner-level) ───────────────

export const IdentityAssuranceLevel = z.enum([
  'NONE',
  'SELF_DECLARED',
  'CONTACT_VERIFIED',
  'ID_FORMAT_VALID',
  'ID_VERIFIED',
]);
export type IdentityAssuranceLevel = z.infer<typeof IdentityAssuranceLevel>;

// ─── Contact identities ────────────────────────────────────────────

export const ContactType = z.enum([
  'EMAIL',
  'PHONE',
  'INSTANT_MESSAGE',
  'SOCIAL_MEDIA',
]);
export type ContactType = z.infer<typeof ContactType>;

export const ContactIdentitySchema = z.object({
  contact_id: z.string().uuid(),
  type: ContactType,
  value: z.string().min(1),
  label: z.string().optional(),
  platform: z.string().optional(),
  verified: z.boolean().default(false),
  verified_at: z.string().nullable().default(null),
  added_at: z.string(),
  verification_proof: VerificationProofSchema.optional(),
});
export type ContactIdentity = z.infer<typeof ContactIdentitySchema>;

// ─── Government IDs (personal, HUMAN only) ──────────────────────────

export const GovernmentIdSchema = z.object({
  country: EuCountryCode,
  id_type: z.string().min(1),
  id_value: z.string().min(1),
  verification_level: VerificationLevel.default('UNVERIFIED'),
  verified_at: z.string().nullable().default(null),
  added_at: z.string(),
  verification_proof: VerificationProofSchema.optional(),
});
export type GovernmentId = z.infer<typeof GovernmentIdSchema>;

// ─── Company IDs (ORG only) ─────────────────────────────────────────

export const CompanyIdType = z.enum([
  'COMPANY_REG',
  'VAT',
  'EORI',
  'LEI',
  'DUNS',
]);
export type CompanyIdType = z.infer<typeof CompanyIdType>;

export const CompanyIdSchema = z.object({
  id_type: CompanyIdType,
  country: EuCountryCode.optional(),
  id_value: z.string().min(1),
  verification_level: VerificationLevel.default('UNVERIFIED'),
  verified_at: z.string().nullable().default(null),
  added_at: z.string(),
  verification_proof: VerificationProofSchema.optional(),
});
export type CompanyId = z.infer<typeof CompanyIdSchema>;

// ─── Signatory roles ────────────────────────────────────────────────

export const SignatoryRole = z.enum([
  'CEO',
  'BOARD_CHAIRMAN',
  'BOARD_MEMBER',
  'AUTHORIZED_SIGNATORY',
  'PROCURATOR',
  'MANAGING_DIRECTOR',
  'SECRETARY',
  'TREASURER',
  'OTHER',
]);
export type SignatoryRole = z.infer<typeof SignatoryRole>;

export const SigningAuthority = z.enum([
  'SOLE',
  'JOINT',
]);
export type SigningAuthority = z.infer<typeof SigningAuthority>;

export const SignatorySchema = z.object({
  signatory_id: z.string().uuid(),
  human_owner_principal_id: z.string().uuid(),
  role: SignatoryRole,
  role_description: z.string().optional(),
  signing_authority: SigningAuthority,
  scope_description: z.string().optional(),
  valid_from: z.string().optional(),
  valid_until: z.string().nullable().default(null),
  added_at: z.string(),
});
export type Signatory = z.infer<typeof SignatorySchema>;

export const SignatoryRuleSchema = z.object({
  rule_id: z.string().uuid(),
  description: z.string(),
  required_signatories: z.number().int().min(1),
  from_roles: z.array(SignatoryRole).optional(),
  scope_description: z.string().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
});
export type SignatoryRule = z.infer<typeof SignatoryRuleSchema>;

// ─── Validation functions ───────────────────────────────────────────

/** Validate a government ID value against its country-specific rules. */
export function validateGovernmentIdValue(
  country: EuCountryCode,
  idType: string,
  value: string,
): ValidationResult {
  const key = `${country}:${idType}`;
  const validator = EU_PERSONAL_ID_VALIDATORS[key];
  if (!validator) {
    // Check if the country is known but the id_type is not
    const knownTypes = EU_PERSONAL_ID_TYPES[country];
    if (knownTypes) {
      return { valid: false, error: `Unknown ID type '${idType}' for country ${country}. Known types: ${knownTypes.join(', ')}` };
    }
    return { valid: false, error: `No validator for ${key}` };
  }
  return validator(value);
}

/** Validate uniqueness and format of government IDs. One per country. */
export function validateGovernmentIds(ids: GovernmentId[]): ValidationResult[] {
  const results: ValidationResult[] = [];
  const seenCountries = new Set<string>();
  for (const id of ids) {
    if (seenCountries.has(id.country)) {
      results.push({ valid: false, error: `Only one government ID allowed per country. Duplicate: ${id.country}` });
    } else {
      seenCountries.add(id.country);
      results.push(validateGovernmentIdValue(id.country, id.id_type, id.id_value));
    }
  }
  return results;
}

/** Validate a company ID value. */
export function validateCompanyIdValue(
  idType: CompanyIdType,
  value: string,
  country?: EuCountryCode,
): ValidationResult {
  switch (idType) {
    case 'VAT':
      return validateVAT(value);
    case 'LEI':
      return validateLEI(value);
    case 'DUNS':
      return validateDUNS(value);
    case 'EORI':
      return validateEORI(value);
    case 'COMPANY_REG':
      if (!country) return { valid: false, error: 'Country is required for company registration numbers' };
      return validateCompanyReg(value, country);
  }
}

/** Validate company IDs. */
export function validateCompanyIds(ids: CompanyId[]): ValidationResult[] {
  return ids.map((id) => validateCompanyIdValue(id.id_type, id.id_value, id.country));
}

/** Basic format validation for contact identities. */
export function validateContactIdentities(contacts: ContactIdentity[]): ValidationResult[] {
  return contacts.map((c) => {
    switch (c.type) {
      case 'EMAIL':
        // Basic email format check (not exhaustive, just catches obvious issues)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)) {
          return { valid: false, error: 'Invalid email format' };
        }
        return { valid: true };
      case 'PHONE':
        // E.164 format or common phone formats
        if (!/^\+?[\d\s\-().]{7,20}$/.test(c.value)) {
          return { valid: false, error: 'Invalid phone format' };
        }
        return { valid: true };
      default:
        // IM and social media: just check non-empty (already enforced by schema)
        return { valid: true };
    }
  });
}

/** Validate signatory references point to existing HUMAN owners. */
export function validateSignatories(
  signatories: Signatory[],
  resolveOwner: (id: string) => OwnerFrontmatter | null,
): ValidationResult[] {
  return signatories.map((s) => {
    const owner = resolveOwner(s.human_owner_principal_id);
    if (!owner) {
      return { valid: false, error: `Referenced human owner ${s.human_owner_principal_id} not found` };
    }
    if (owner.principal_type !== 'HUMAN') {
      return { valid: false, error: `Referenced owner ${s.human_owner_principal_id} is not a HUMAN (is ${owner.principal_type})` };
    }
    return { valid: true };
  });
}

/** Validate all identity fields on an owner. */
export function validateOwnerIdentity(
  owner: OwnerFrontmatter,
  resolveOwner?: (id: string) => OwnerFrontmatter | null,
): {
  contacts: ValidationResult[];
  government_ids: ValidationResult[];
  company_ids: ValidationResult[];
  signatories: ValidationResult[];
  type_errors: string[];
} {
  const typeErrors: string[] = [];

  // Type constraint enforcement
  if (owner.principal_type === 'ORG' && owner.government_ids?.length) {
    typeErrors.push('Government IDs are only allowed for HUMAN owners');
  }
  if (owner.principal_type === 'HUMAN' && owner.company_ids?.length) {
    typeErrors.push('Company IDs are only allowed for ORG owners');
  }
  if (owner.principal_type === 'HUMAN' && owner.signatories?.length) {
    typeErrors.push('Signatories are only allowed for ORG owners');
  }
  if (owner.principal_type === 'HUMAN' && owner.signatory_rules?.length) {
    typeErrors.push('Signatory rules are only allowed for ORG owners');
  }

  return {
    contacts: owner.contact_identities ? validateContactIdentities(owner.contact_identities) : [],
    government_ids: owner.government_ids ? validateGovernmentIds(owner.government_ids) : [],
    company_ids: owner.company_ids ? validateCompanyIds(owner.company_ids) : [],
    signatories: owner.signatories && resolveOwner ? validateSignatories(owner.signatories, resolveOwner) : [],
    type_errors: typeErrors,
  };
}

/** Compute the identity assurance level from the owner's identity state. */
export function computeAssuranceLevel(owner: OwnerFrontmatter): IdentityAssuranceLevel {
  const govIds = owner.government_ids ?? [];
  const companyIds = owner.company_ids ?? [];
  const contacts = owner.contact_identities ?? [];

  // Check for verified government/company IDs (highest level)
  const hasVerifiedId = [...govIds, ...companyIds].some(
    (id) => id.verification_level === 'VERIFIED',
  );
  if (hasVerifiedId) return 'ID_VERIFIED';

  // Check for format-valid government/company IDs
  const hasFormatValidId = [...govIds, ...companyIds].some(
    (id) => id.verification_level === 'FORMAT_VALID',
  );
  if (hasFormatValidId) return 'ID_FORMAT_VALID';

  // Check for verified contacts
  const hasVerifiedContact = contacts.some((c) => c.verified);
  if (hasVerifiedContact) return 'CONTACT_VERIFIED';

  // Check for any declared identities
  const hasAnyIdentity = contacts.length > 0 || govIds.length > 0 || companyIds.length > 0;
  if (hasAnyIdentity) return 'SELF_DECLARED';

  return 'NONE';
}
