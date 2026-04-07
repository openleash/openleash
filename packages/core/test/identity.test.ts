import { describe, it, expect } from 'vitest';
import {
  ContactIdentitySchema,
  GovernmentIdSchema,
  CompanyIdSchema,
  OrgDomainSchema,
  SignatorySchema,
  SignatoryRuleSchema,
  validateGovernmentIdValue,
  validateGovernmentIds,
  validateCompanyIdValue,
  validateContactIdentities,
  validateDomainName,
  validateOrgDomains,
  validateSignatories,
  validateUserIdentity,
  validateOrgIdentity,
  computeUserAssuranceLevel,
  computeOrgAssuranceLevel,
} from '../src/identity.js';
import type { UserFrontmatter, OrganizationFrontmatter } from '../src/types.js';

// ─── Zod schema tests ───────────────────────────────────────────────

describe('ContactIdentitySchema', () => {
  it('parses valid email contact', () => {
    const result = ContactIdentitySchema.parse({
      contact_id: 'a0000000-0000-4000-8000-000000000001',
      type: 'EMAIL',
      value: 'test@example.com',
      added_at: '2026-02-25T10:00:00.000Z',
    });
    expect(result.verified).toBe(false);
    expect(result.verified_at).toBeNull();
  });

  it('parses contact with all optional fields', () => {
    const result = ContactIdentitySchema.parse({
      contact_id: 'a0000000-0000-4000-8000-000000000001',
      type: 'INSTANT_MESSAGE',
      value: '@user',
      label: 'Personal Signal',
      platform: 'SIGNAL',
      verified: true,
      verified_at: '2026-02-25T10:00:00.000Z',
      added_at: '2026-02-25T10:00:00.000Z',
    });
    expect(result.label).toBe('Personal Signal');
    expect(result.platform).toBe('SIGNAL');
    expect(result.verified).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(() => ContactIdentitySchema.parse({
      type: 'EMAIL',
      value: 'test@example.com',
    })).toThrow();
  });
});

describe('GovernmentIdSchema', () => {
  it('parses valid government ID', () => {
    const result = GovernmentIdSchema.parse({
      country: 'SE',
      id_type: 'PERSONNUMMER',
      id_value: '811228-9874',
      added_at: '2026-02-25T10:00:00.000Z',
    });
    expect(result.verification_level).toBe('UNVERIFIED');
    expect(result.verified_at).toBeNull();
  });

  it('rejects invalid country code', () => {
    expect(() => GovernmentIdSchema.parse({
      country: 'XX',
      id_type: 'PERSONNUMMER',
      id_value: '811228-9874',
      added_at: '2026-02-25T10:00:00.000Z',
    })).toThrow();
  });
});

describe('CompanyIdSchema', () => {
  it('parses valid company ID', () => {
    const result = CompanyIdSchema.parse({
      id_type: 'VAT',
      country: 'SE',
      id_value: 'SE556123456701',
      added_at: '2026-02-25T10:00:00.000Z',
    });
    expect(result.verification_level).toBe('UNVERIFIED');
  });

  it('allows LEI without country', () => {
    const result = CompanyIdSchema.parse({
      id_type: 'LEI',
      id_value: '5493001KJTIIGC8Y1R12',
      added_at: '2026-02-25T10:00:00.000Z',
    });
    expect(result.country).toBeUndefined();
  });
});

describe('SignatorySchema', () => {
  it('parses valid signatory', () => {
    const result = SignatorySchema.parse({
      signatory_id: 'a0000000-0000-4000-8000-000000000001',
      human_owner_principal_id: 'b0000000-0000-4000-8000-000000000002',
      role: 'CEO',
      signing_authority: 'SOLE',
      scope_description: 'All matters',
      added_at: '2026-02-25T10:00:00.000Z',
    });
    expect(result.role).toBe('CEO');
    expect(result.valid_until).toBeNull();
  });
});

describe('SignatoryRuleSchema', () => {
  it('parses valid signatory rule', () => {
    const result = SignatoryRuleSchema.parse({
      rule_id: 'a0000000-0000-4000-8000-000000000001',
      description: 'Two board members must co-sign',
      required_signatories: 2,
      from_roles: ['BOARD_MEMBER', 'BOARD_CHAIRMAN'],
    });
    expect(result.required_signatories).toBe(2);
  });

  it('allows conditions', () => {
    const result = SignatoryRuleSchema.parse({
      rule_id: 'a0000000-0000-4000-8000-000000000001',
      description: 'CEO for small amounts',
      required_signatories: 1,
      from_roles: ['CEO'],
      conditions: { max_amount: 100000, currency: 'SEK' },
    });
    expect(result.conditions).toEqual({ max_amount: 100000, currency: 'SEK' });
  });
});

// ─── Validation function tests ──────────────────────────────────────

describe('validateGovernmentIdValue', () => {
  it('validates Swedish personnummer', () => {
    expect(validateGovernmentIdValue('SE', 'PERSONNUMMER', '811228-9874').valid).toBe(true);
  });

  it('rejects invalid personnummer', () => {
    expect(validateGovernmentIdValue('SE', 'PERSONNUMMER', '811228-9875').valid).toBe(false);
  });

  it('returns error for unknown ID type', () => {
    const result = validateGovernmentIdValue('SE', 'UNKNOWN_TYPE', '123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown ID type');
  });
});

describe('validateGovernmentIds', () => {
  it('validates multiple unique IDs', () => {
    const results = validateGovernmentIds([
      { country: 'SE', id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      { country: 'NL', id_type: 'BSN', id_value: '111222333', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it('rejects duplicate country (one ID per country)', () => {
    const results = validateGovernmentIds([
      { country: 'SE', id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      { country: 'SE', id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[1].valid).toBe(false);
    expect(results[1].error).toContain('Duplicate');
  });

  it('rejects different ID types for the same country', () => {
    const results = validateGovernmentIds([
      { country: 'ES', id_type: 'DNI', id_value: '12345678Z', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      { country: 'ES', id_type: 'NIE', id_value: 'X1234567L', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[1].valid).toBe(false);
    expect(results[1].error).toContain('Only one government ID allowed per country');
  });
});

describe('validateCompanyIdValue', () => {
  it('validates VAT number', () => {
    expect(validateCompanyIdValue('VAT', 'SE556123456701').valid).toBe(true);
  });

  it('validates LEI', () => {
    expect(validateCompanyIdValue('LEI', '5493001KJTIIGC8Y1R12').valid).toBe(true);
  });

  it('requires country for COMPANY_REG', () => {
    expect(validateCompanyIdValue('COMPANY_REG', '12345678').valid).toBe(false);
  });

  it('accepts COMPANY_REG with country', () => {
    expect(validateCompanyIdValue('COMPANY_REG', '12345678', 'DK').valid).toBe(true);
  });
});

describe('validateContactIdentities', () => {
  it('validates email format', () => {
    const results = validateContactIdentities([
      { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'EMAIL', value: 'test@example.com', verified: false, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[0].valid).toBe(true);
  });

  it('rejects invalid email format', () => {
    const results = validateContactIdentities([
      { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'EMAIL', value: 'not-an-email', verified: false, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[0].valid).toBe(false);
  });

  it('validates phone format', () => {
    const results = validateContactIdentities([
      { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'PHONE', value: '+46701234567', verified: false, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[0].valid).toBe(true);
  });

  it('accepts IM without further validation', () => {
    const results = validateContactIdentities([
      { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'INSTANT_MESSAGE', value: '@user', platform: 'SIGNAL', verified: false, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[0].valid).toBe(true);
  });
});

describe('validateSignatories', () => {
  const humanUser: UserFrontmatter = {
    user_principal_id: 'b0000000-0000-4000-8000-000000000002',
    display_name: 'Alice',
    status: 'ACTIVE',
    attributes: {},
    created_at: '2026-01-01T00:00:00Z',
  };

  const resolveUser = (id: string) => {
    if (id === humanUser.user_principal_id) return humanUser;
    return null;
  };

  it('accepts signatory referencing a user', () => {
    const results = validateSignatories([
      {
        signatory_id: 'd0000000-0000-4000-8000-000000000010',
        human_owner_principal_id: humanUser.user_principal_id,
        role: 'CEO',
        signing_authority: 'SOLE',
        valid_until: null,
        added_at: '2026-01-01T00:00:00Z',
      },
    ], resolveUser);
    expect(results[0].valid).toBe(true);
  });

  it('rejects signatory referencing non-existent user', () => {
    const results = validateSignatories([
      {
        signatory_id: 'd0000000-0000-4000-8000-000000000010',
        human_owner_principal_id: 'e0000000-0000-4000-8000-999999999999',
        role: 'CEO',
        signing_authority: 'SOLE',
        valid_until: null,
        added_at: '2026-01-01T00:00:00Z',
      },
    ], resolveUser);
    expect(results[0].valid).toBe(false);
    expect(results[0].error).toContain('not found');
  });
});

// ─── validateUserIdentity / validateOrgIdentity ────────────────────

describe('validateUserIdentity', () => {
  it('accepts empty identity fields', () => {
    const user: UserFrontmatter = {
      user_principal_id: 'a0000000-0000-4000-8000-000000000001',
      display_name: 'Alice',
      status: 'ACTIVE',
      attributes: {},
      created_at: '2026-01-01T00:00:00Z',
    };
    const result = validateUserIdentity(user);
    expect(result.type_errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(0);
    expect(result.government_ids).toHaveLength(0);
  });

  it('validates government IDs on user', () => {
    const user: UserFrontmatter = {
      user_principal_id: 'a0000000-0000-4000-8000-000000000001',
      display_name: 'Alice',
      status: 'ACTIVE',
      attributes: {},
      created_at: '2026-01-01T00:00:00Z',
      government_ids: [
        { country: 'SE', id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const result = validateUserIdentity(user);
    expect(result.type_errors).toHaveLength(0);
    expect(result.government_ids).toHaveLength(1);
  });
});

describe('validateOrgIdentity', () => {
  it('accepts empty identity fields', () => {
    const org: OrganizationFrontmatter = {
      org_id: 'a0000000-0000-4000-8000-000000000001',
      display_name: 'Acme',
      status: 'ACTIVE',
      attributes: {},
      created_at: '2026-01-01T00:00:00Z',
      created_by_user_id: 'b0000000-0000-4000-8000-000000000002',
    };
    const result = validateOrgIdentity(org);
    expect(result.type_errors).toHaveLength(0);
    expect(result.contacts).toHaveLength(0);
    expect(result.company_ids).toHaveLength(0);
  });

  it('validates company IDs on org', () => {
    const org: OrganizationFrontmatter = {
      org_id: 'a0000000-0000-4000-8000-000000000001',
      display_name: 'Acme',
      status: 'ACTIVE',
      attributes: {},
      created_at: '2026-01-01T00:00:00Z',
      created_by_user_id: 'b0000000-0000-4000-8000-000000000002',
      company_ids: [
        { id_type: 'VAT', id_value: 'SE556123456701', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const result = validateOrgIdentity(org);
    expect(result.type_errors).toHaveLength(0);
    expect(result.company_ids).toHaveLength(1);
  });
});

// ─── computeUserAssuranceLevel / computeOrgAssuranceLevel ──────────

describe('computeUserAssuranceLevel', () => {
  const baseUser: UserFrontmatter = {
    user_principal_id: 'a0000000-0000-4000-8000-000000000001',
    display_name: 'Alice',
    status: 'ACTIVE',
    attributes: {},
    created_at: '2026-01-01T00:00:00Z',
  };

  it('returns NONE for user with no identities', () => {
    expect(computeUserAssuranceLevel(baseUser)).toBe('NONE');
  });

  it('returns SELF_DECLARED for unverified contact', () => {
    const user = {
      ...baseUser,
      contact_identities: [
        { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'EMAIL' as const, value: 'test@example.com', verified: false, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(computeUserAssuranceLevel(user)).toBe('SELF_DECLARED');
  });

  it('returns CONTACT_VERIFIED for verified contact', () => {
    const user = {
      ...baseUser,
      contact_identities: [
        { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'EMAIL' as const, value: 'test@example.com', verified: true, verified_at: '2026-01-01T00:00:00Z', added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(computeUserAssuranceLevel(user)).toBe('CONTACT_VERIFIED');
  });

  it('returns ID_FORMAT_VALID for format-valid government ID', () => {
    const user = {
      ...baseUser,
      government_ids: [
        { country: 'SE' as const, id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'FORMAT_VALID' as const, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(computeUserAssuranceLevel(user)).toBe('ID_FORMAT_VALID');
  });

  it('returns ID_VERIFIED for verified government ID', () => {
    const user = {
      ...baseUser,
      government_ids: [
        { country: 'SE' as const, id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'VERIFIED' as const, verified_at: '2026-01-01T00:00:00Z', added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(computeUserAssuranceLevel(user)).toBe('ID_VERIFIED');
  });

  it('returns highest applicable level', () => {
    const user = {
      ...baseUser,
      contact_identities: [
        { contact_id: 'a0000000-0000-4000-8000-000000000001', type: 'EMAIL' as const, value: 'test@example.com', verified: true, verified_at: '2026-01-01T00:00:00Z', added_at: '2026-01-01T00:00:00Z' },
      ],
      government_ids: [
        { country: 'SE' as const, id_type: 'PERSONNUMMER', id_value: '811228-9874', verification_level: 'FORMAT_VALID' as const, verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(computeUserAssuranceLevel(user)).toBe('ID_FORMAT_VALID');
  });
});

describe('computeOrgAssuranceLevel', () => {
  it('handles org with company IDs', () => {
    const org: OrganizationFrontmatter = {
      org_id: 'a0000000-0000-4000-8000-000000000001',
      display_name: 'Acme',
      status: 'ACTIVE',
      attributes: {},
      created_at: '2026-01-01T00:00:00Z',
      created_by_user_id: 'b0000000-0000-4000-8000-000000000002',
      company_ids: [
        { id_type: 'VAT', id_value: 'SE556123456701', verification_level: 'VERIFIED', verified_at: '2026-01-01T00:00:00Z', added_at: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(computeOrgAssuranceLevel(org)).toBe('ID_VERIFIED');
  });
});

// ─── OrgDomain schema & validation ─────────────────────────────────

describe('OrgDomainSchema', () => {
  it('parses a valid domain entry', () => {
    const result = OrgDomainSchema.safeParse({
      domain_id: 'a0000000-0000-4000-8000-000000000001',
      domain: 'example.com',
      added_at: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verification_level).toBe('UNVERIFIED');
      expect(result.data.verified_at).toBeNull();
    }
  });
});

describe('validateDomainName', () => {
  it('accepts valid domain', () => {
    expect(validateDomainName('example.com').valid).toBe(true);
  });
  it('accepts subdomain', () => {
    expect(validateDomainName('sub.example.com').valid).toBe(true);
  });
  it('accepts hyphenated labels', () => {
    expect(validateDomainName('my-company.co.uk').valid).toBe(true);
  });
  it('rejects single label (no TLD)', () => {
    expect(validateDomainName('localhost').valid).toBe(false);
  });
  it('rejects empty string', () => {
    expect(validateDomainName('').valid).toBe(false);
  });
  it('rejects label starting with hyphen', () => {
    expect(validateDomainName('-example.com').valid).toBe(false);
  });
  it('rejects label ending with hyphen', () => {
    expect(validateDomainName('example-.com').valid).toBe(false);
  });
  it('rejects spaces', () => {
    expect(validateDomainName('example .com').valid).toBe(false);
  });
  it('rejects underscores', () => {
    expect(validateDomainName('my_domain.com').valid).toBe(false);
  });
});

describe('validateOrgDomains', () => {
  it('validates multiple valid domains', () => {
    const results = validateOrgDomains([
      { domain_id: 'a0000000-0000-4000-8000-000000000001', domain: 'example.com', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      { domain_id: 'a0000000-0000-4000-8000-000000000002', domain: 'other.org', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results.every((r) => r.valid)).toBe(true);
  });
  it('rejects duplicate domains', () => {
    const results = validateOrgDomains([
      { domain_id: 'a0000000-0000-4000-8000-000000000001', domain: 'example.com', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
      { domain_id: 'a0000000-0000-4000-8000-000000000002', domain: 'example.com', verification_level: 'UNVERIFIED', verified_at: null, added_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[1].error).toContain('Duplicate');
  });
});
