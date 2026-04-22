/**
 * Organization slug rules and helpers.
 *
 * Slugs appear in URLs like `/gui/orgs/:slug/...`, so they must not collide
 * with top-level GUI paths (personal, admin, profile, etc.).
 */

export const ORG_SLUG_MIN_LENGTH = 3;
export const ORG_SLUG_MAX_LENGTH = 40;

/**
 * Reserved slugs that would shadow top-level GUI/API routes or reserved words.
 * Attempting to create or rename an org to one of these is rejected.
 */
export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
  'personal',
  'admin',
  'api',
  'gui',
  'v1',
  'new',
  'create',
  'orgs',
  'organizations',
  'users',
  'user',
  'agents',
  'policies',
  'approvals',
  'audit',
  'profile',
  'settings',
  'login',
  'logout',
  'setup',
  'dashboard',
  'members',
  'invites',
  'me',
  'self',
  'health',
  'public-keys',
  'verify-proof',
  'authorize',
  'playground',
  'static',
  'assets',
  'about',
  'help',
  'docs',
  'null',
  'undefined',
]);

const SLUG_FORMAT = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type SlugValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Validate an org slug. Returns `{ ok: true }` if the slug is acceptable. */
export function validateOrgSlug(slug: unknown): SlugValidationResult {
  if (typeof slug !== 'string') {
    return { ok: false, error: 'slug must be a string' };
  }
  if (slug.length < ORG_SLUG_MIN_LENGTH) {
    return {
      ok: false,
      error: `slug must be at least ${ORG_SLUG_MIN_LENGTH} characters`,
    };
  }
  if (slug.length > ORG_SLUG_MAX_LENGTH) {
    return {
      ok: false,
      error: `slug must be at most ${ORG_SLUG_MAX_LENGTH} characters`,
    };
  }
  if (!SLUG_FORMAT.test(slug)) {
    return {
      ok: false,
      error:
        'slug must contain only lowercase letters, digits, and hyphens, and cannot start or end with a hyphen',
    };
  }
  if (slug.includes('--')) {
    return { ok: false, error: 'slug cannot contain consecutive hyphens' };
  }
  if (RESERVED_ORG_SLUGS.has(slug)) {
    return { ok: false, error: `"${slug}" is reserved and cannot be used as a slug` };
  }
  return { ok: true };
}

/**
 * Best-effort slugification of an arbitrary string (typically an org display name).
 * Output is guaranteed to pass `validateOrgSlug` *shape* checks when combined with
 * `ensureUniqueSlug`, but callers should still validate the final value.
 */
export function slugifyName(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base.length >= ORG_SLUG_MIN_LENGTH && base.length <= ORG_SLUG_MAX_LENGTH) {
    return base;
  }
  if (base.length > ORG_SLUG_MAX_LENGTH) {
    return base.slice(0, ORG_SLUG_MAX_LENGTH).replace(/-+$/g, '');
  }
  // Too short — pad with 'org' prefix so we never return something below the min.
  const padded = `org-${base}`.slice(0, ORG_SLUG_MAX_LENGTH);
  return padded.length >= ORG_SLUG_MIN_LENGTH ? padded : 'org';
}

/**
 * Given a candidate slug and a set of slugs already in use, return a unique slug
 * by appending `-2`, `-3`, etc. Also bumps off reserved words by suffixing `-1`.
 */
export function ensureUniqueSlug(
  candidate: string,
  inUse: ReadonlySet<string>,
): string {
  let base = candidate;
  if (RESERVED_ORG_SLUGS.has(base)) {
    base = `${base}-1`;
  }
  if (!inUse.has(base)) return base;

  let n = 2;
  while (inUse.has(`${base}-${n}`)) {
    n += 1;
    if (n > 10_000) {
      // Extremely unlikely, but stop the loop rather than spin forever.
      return `${base}-${Date.now().toString(36)}`;
    }
  }
  return `${base}-${n}`;
}
