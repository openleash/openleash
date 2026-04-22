import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DataStore, SessionClaims, OrgRole } from '@openleash/core';

/**
 * The "scope" a user is acting within in the GUI. `personal` means the user's
 * own agents/policies; `org` means an organization the user belongs to.
 *
 * Scope is surfaced in the sidebar switcher and in URL structure. Phase 2 adds
 * the switcher and slug-based aliases; Phase 3 will flip all owner GUI routes
 * to be scoped (`/gui/personal/*`, `/gui/orgs/:slug/*`).
 */
export type Scope =
    | {
          type: 'user';
          id: string;
          display_name: string;
      }
    | {
          type: 'org';
          id: string;
          slug: string;
          display_name: string;
          role: OrgRole;
      };

export interface AvailableScopes {
    current: Scope;
    available: Scope[];
    /** True when the user can switch to an org scope. Used to hide the switcher for solo users. */
    hasOrgs: boolean;
}

const LAST_SCOPE_COOKIE = 'openleash_last_scope';
const LAST_SCOPE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/**
 * Encode a scope as a cookie value. Personal → `personal`; org → `org:<slug>`.
 * Slug is a stable identifier under user control, so it's safe to expose in the
 * cookie rather than an opaque org_id.
 */
export function encodeScopeCookie(scope: Scope): string {
    return scope.type === 'user' ? 'personal' : `org:${scope.slug}`;
}

/**
 * Decode the last_scope cookie into either `{ type: 'personal' }` or
 * `{ type: 'org', slug }`. The caller is responsible for resolving that slug
 * against the store (the cookie value may be stale after a rename).
 */
export function decodeScopeCookie(
    value: string | undefined | null,
): { type: 'personal' } | { type: 'org'; slug: string } | null {
    if (!value || typeof value !== 'string') return null;
    if (value === 'personal') return { type: 'personal' };
    if (value.startsWith('org:')) {
        const slug = value.slice(4).trim();
        if (!slug) return null;
        return { type: 'org', slug };
    }
    return null;
}

export function readLastScopeCookie(request: FastifyRequest): string | null {
    const header = request.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const [rawName, ...rawRest] = part.split('=');
        if (rawName?.trim() === LAST_SCOPE_COOKIE) {
            return decodeURIComponent(rawRest.join('=').trim());
        }
    }
    return null;
}

export function writeLastScopeCookie(reply: FastifyReply, scope: Scope): void {
    const value = encodeScopeCookie(scope);
    const parts = [
        `${LAST_SCOPE_COOKIE}=${encodeURIComponent(value)}`,
        `Path=/gui`,
        `Max-Age=${LAST_SCOPE_MAX_AGE_SECONDS}`,
        `SameSite=Lax`,
        `HttpOnly`,
    ];
    reply.header('Set-Cookie', parts.join('; '));
}

/**
 * Compute the list of scopes this user can act within. Always includes
 * personal; adds every org the user is an active member of. Orgs missing a
 * slug (shouldn't happen post-migration) are silently skipped.
 */
export function buildAvailableScopes(
    store: DataStore,
    session: SessionClaims,
): { personal: Scope; orgs: Scope[] } {
    let user;
    try {
        user = store.users.read(session.sub);
    } catch {
        user = null;
    }
    const personal: Scope = {
        type: 'user',
        id: session.sub,
        display_name: user?.display_name ?? 'Personal',
    };

    const orgs: Scope[] = [];
    const memberships = store.memberships.listByUser(session.sub);
    for (const m of memberships) {
        if (m.status !== 'active') continue;
        try {
            const org = store.organizations.read(m.org_id);
            if (!org.slug) continue;
            orgs.push({
                type: 'org',
                id: org.org_id,
                slug: org.slug,
                display_name: org.display_name,
                role: m.role,
            });
        } catch {
            // Org file missing — skip.
        }
    }
    return { personal, orgs };
}

/**
 * Determine the current scope for a request. Resolution order:
 *   1. URL pattern: `/gui/orgs/:slug/*` → that org (if user is a member).
 *   2. URL pattern: `/gui/organizations/:orgId/*` → that org (if user is a member).
 *   3. last_scope cookie, if it points to a scope the user still has access to.
 *   4. Personal.
 *
 * Returns `null` only when the session is entirely invalid (user record gone).
 */
export function resolveCurrentScope(
    store: DataStore,
    session: SessionClaims,
    request: FastifyRequest,
): AvailableScopes | null {
    const built = buildAvailableScopes(store, session);
    const url = request.url.split('?')[0];

    const pickOrgById = (orgId: string): Scope | null =>
        built.orgs.find((s) => s.type === 'org' && s.id === orgId) ?? null;
    const pickOrgBySlug = (slug: string): Scope | null =>
        built.orgs.find((s) => s.type === 'org' && s.slug === slug) ?? null;

    // Explicit personal-scope URL pattern — overrides the cookie so that
    // `/gui/personal/*` links always show personal data, regardless of the
    // user's last-visited scope.
    if (/^\/gui\/personal(\/|$)/.test(url)) {
        return toAvailable(built.personal, built);
    }

    // URL-based resolution
    const slugMatch = url.match(/^\/gui\/orgs\/([^/]+)/);
    if (slugMatch) {
        const slug = decodeURIComponent(slugMatch[1]!);
        const byCurrent = pickOrgBySlug(slug);
        if (byCurrent) {
            return toAvailable(byCurrent, built);
        }
        // Slug may be historical — try resolving via the store to find the org,
        // then match the member list by org_id.
        try {
            const org = store.organizations.readBySlug(slug);
            if (org) {
                const match = pickOrgById(org.org_id);
                if (match) return toAvailable(match, built);
            }
        } catch {
            // ignore
        }
    }

    const idMatch = url.match(/^\/gui\/organizations\/([^/]+)/);
    if (idMatch) {
        const match = pickOrgById(idMatch[1]!);
        if (match) return toAvailable(match, built);
    }

    // Cookie-based fallback
    const cookie = decodeScopeCookie(readLastScopeCookie(request));
    if (cookie?.type === 'org') {
        const match = pickOrgBySlug(cookie.slug);
        if (match) return toAvailable(match, built);
    }

    // Default: personal
    return toAvailable(built.personal, built);
}

function toAvailable(
    current: Scope,
    built: { personal: Scope; orgs: Scope[] },
): AvailableScopes {
    return {
        current,
        available: [built.personal, ...built.orgs],
        hasOrgs: built.orgs.length > 0,
    };
}

/**
 * Convert a scope into the `{ owner_type, owner_id }` shape used by data
 * filters throughout the codebase (agents/policies/audit are all keyed on
 * that pair via `OwnerType | 'user' | 'org'`).
 */
export function scopeOwner(scope: Scope): { ownerType: 'user' | 'org'; ownerId: string } {
    return { ownerType: scope.type, ownerId: scope.id };
}

/**
 * Same as `scopeOwner`, but takes an `AvailableScopes` (what handlers get back
 * from `resolveCurrentScope`) so callers don't need to drill into `.current`.
 */
export function currentOwner(resolved: AvailableScopes): { ownerType: 'user' | 'org'; ownerId: string } {
    return scopeOwner(resolved.current);
}

/**
 * Count pending approval requests across every scope a user can act within.
 * Used by the sidebar bell badge and the cross-scope inbox. Cheap to call on
 * every owner page render — it reads the in-memory state index, not files.
 */
export function countPendingApprovalsAcrossScopes(
    store: DataStore,
    session: SessionClaims,
): number {
    const state = store.state.getState();
    const memberships = store.memberships.listByUser(session.sub);
    const activeOrgIds = new Set(
        memberships.filter((m) => m.status === 'active').map((m) => m.org_id),
    );
    let total = 0;
    for (const r of state.approval_requests ?? []) {
        if (r.status !== 'PENDING') continue;
        if (r.owner_type === 'user' && r.owner_id === session.sub) total += 1;
        else if (r.owner_type === 'org' && activeOrgIds.has(r.owner_id)) total += 1;
    }
    return total;
}

export interface PendingScopeGroup {
    scope: Scope;
    approvalRequestIds: string[];
}

/**
 * Walk every scope the user can act within and return pending approval IDs
 * grouped by scope. The inbox page uses this to render a sectioned list;
 * empty scopes are omitted.
 */
export function listPendingApprovalsByScope(
    store: DataStore,
    session: SessionClaims,
): PendingScopeGroup[] {
    const state = store.state.getState();
    const built = buildAvailableScopes(store, session);
    const scopes: Scope[] = [built.personal, ...built.orgs];
    const groups: PendingScopeGroup[] = [];
    for (const scope of scopes) {
        const ids = (state.approval_requests ?? [])
            .filter((r) =>
                r.status === 'PENDING' &&
                r.owner_type === scope.type &&
                r.owner_id === scope.id,
            )
            .map((r) => r.approval_request_id);
        if (ids.length > 0) {
            groups.push({ scope, approvalRequestIds: ids });
        }
    }
    return groups;
}

/**
 * PreHandler for routes under `/gui/orgs/:slug/*`. Validates the slug and
 * membership, and redirects historical slugs to the current one so we always
 * render on the canonical URL.
 *
 * 404s if:
 *   - the slug doesn't resolve to any org (never seen or corrupted state), or
 *   - the user isn't an active member of the resolved org.
 * 302s if the slug is historical (lives only in `slug_history`).
 */
export function createOrgScopePreHandler(store: DataStore) {
    return async function orgScopePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const session = (request as unknown as Record<string, unknown>).ownerSession as SessionClaims | undefined;
        if (!session) {
            // ownerAuth should have run first; if it didn't, short-circuit with 401.
            reply.code(401).type('text/html').send('<h1>Unauthorized</h1>');
            return;
        }
        const params = request.params as { slug?: string };
        const rawSlug = params.slug;
        if (!rawSlug) {
            reply.code(404).type('text/html').send('<h1>Organization not found</h1>');
            return;
        }

        const org = store.organizations.readBySlug(rawSlug);
        if (!org) {
            reply.code(404).type('text/html').send('<h1>Organization not found</h1>');
            return;
        }

        const membership = store.memberships
            .listByUser(session.sub)
            .find((m) => m.org_id === org.org_id && m.status === 'active');
        if (!membership) {
            // Pretend the org doesn't exist rather than leaking its existence
            // to a non-member.
            reply.code(404).type('text/html').send('<h1>Organization not found</h1>');
            return;
        }

        // If the param was a historical slug, canonicalize with a 302 so the
        // URL bar, bookmarks, and the sidebar switcher all converge on the
        // current slug.
        if (org.slug !== rawSlug) {
            const canonical = request.url.replace(
                `/gui/orgs/${encodeURIComponent(rawSlug)}`,
                `/gui/orgs/${encodeURIComponent(org.slug)}`,
            );
            reply.redirect(canonical);
            return;
        }
    };
}
