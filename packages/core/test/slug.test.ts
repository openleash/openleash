import { describe, it, expect } from 'vitest';
import {
  validateOrgSlug,
  slugifyName,
  ensureUniqueSlug,
  RESERVED_ORG_SLUGS,
  ORG_SLUG_MIN_LENGTH,
  ORG_SLUG_MAX_LENGTH,
} from '../src/slug.js';

describe('validateOrgSlug', () => {
  it('accepts a well-formed slug', () => {
    expect(validateOrgSlug('acme')).toEqual({ ok: true });
    expect(validateOrgSlug('acme-corp')).toEqual({ ok: true });
    expect(validateOrgSlug('a1b2c3')).toEqual({ ok: true });
  });

  it('rejects non-strings', () => {
    expect(validateOrgSlug(undefined).ok).toBe(false);
    expect(validateOrgSlug(null).ok).toBe(false);
    expect(validateOrgSlug(42).ok).toBe(false);
  });

  it('enforces length bounds', () => {
    expect(validateOrgSlug('ab').ok).toBe(false);
    expect(validateOrgSlug('a'.repeat(ORG_SLUG_MAX_LENGTH + 1)).ok).toBe(false);
    expect(validateOrgSlug('a'.repeat(ORG_SLUG_MIN_LENGTH)).ok).toBe(true);
    expect(validateOrgSlug('a'.repeat(ORG_SLUG_MAX_LENGTH)).ok).toBe(true);
  });

  it('rejects uppercase, spaces, and invalid characters', () => {
    expect(validateOrgSlug('Acme').ok).toBe(false);
    expect(validateOrgSlug('acme corp').ok).toBe(false);
    expect(validateOrgSlug('acme_corp').ok).toBe(false);
    expect(validateOrgSlug('acme.corp').ok).toBe(false);
    expect(validateOrgSlug('acme/corp').ok).toBe(false);
  });

  it('rejects leading/trailing hyphens and double hyphens', () => {
    expect(validateOrgSlug('-acme').ok).toBe(false);
    expect(validateOrgSlug('acme-').ok).toBe(false);
    expect(validateOrgSlug('acme--corp').ok).toBe(false);
  });

  it('rejects every reserved slug', () => {
    for (const reserved of RESERVED_ORG_SLUGS) {
      const result = validateOrgSlug(reserved);
      expect(result.ok, `expected "${reserved}" to be rejected`).toBe(false);
    }
  });
});

describe('slugifyName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyName('Acme Corp')).toBe('acme-corp');
    expect(slugifyName('Acme, Inc.')).toBe('acme-inc');
  });

  it('strips diacritics', () => {
    expect(slugifyName('Café Curioso')).toBe('cafe-curioso');
  });

  it('collapses runs of non-alphanumerics into a single hyphen', () => {
    expect(slugifyName('Acme   —   Corp!!!')).toBe('acme-corp');
  });

  it('pads short names to satisfy the minimum length', () => {
    const slug = slugifyName('X');
    expect(slug.length).toBeGreaterThanOrEqual(ORG_SLUG_MIN_LENGTH);
  });

  it('truncates long names without trailing hyphens', () => {
    const long = 'the quick brown fox jumps over the lazy dog many times over';
    const slug = slugifyName(long);
    expect(slug.length).toBeLessThanOrEqual(ORG_SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('ensureUniqueSlug', () => {
  it('returns the candidate unchanged when unused', () => {
    expect(ensureUniqueSlug('acme', new Set())).toBe('acme');
  });

  it('appends -2, -3, ... on collision', () => {
    expect(ensureUniqueSlug('acme', new Set(['acme']))).toBe('acme-2');
    expect(ensureUniqueSlug('acme', new Set(['acme', 'acme-2']))).toBe('acme-3');
  });

  it('bumps reserved candidates to a non-reserved variant', () => {
    const result = ensureUniqueSlug('personal', new Set());
    expect(result).not.toBe('personal');
    expect(result.startsWith('personal-')).toBe(true);
  });
});
