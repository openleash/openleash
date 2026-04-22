import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createFileDataStore } from "@openleash/core";
import type { DataStore, SessionClaims } from "@openleash/core";
import {
    buildAvailableScopes,
    resolveCurrentScope,
    encodeScopeCookie,
    decodeScopeCookie,
    readLastScopeCookie,
    writeLastScopeCookie,
} from "../src/scope.js";

/**
 * Minimal FastifyRequest stand-in. Only the fields `resolveCurrentScope`
 * actually reads (`url`, `headers.cookie`) are provided.
 */
function makeRequest(url: string, cookie?: string): import("fastify").FastifyRequest {
    return {
        url,
        headers: cookie ? { cookie } : {},
    } as unknown as import("fastify").FastifyRequest;
}

function makeReply(): {
    reply: import("fastify").FastifyReply;
    headers: Record<string, string>;
} {
    const headers: Record<string, string> = {};
    const reply = {
        header(name: string, value: string) {
            headers[name] = value;
            return reply;
        },
    } as unknown as import("fastify").FastifyReply;
    return { reply, headers };
}

function seedUser(store: DataStore, name = "Alice"): string {
    const id = crypto.randomUUID();
    store.users.write({
        user_principal_id: id,
        display_name: name,
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
    });
    store.state.updateState((s) => {
        s.users.push({ user_principal_id: id, path: `./users/${id}.md` });
    });
    return id;
}

function seedOrg(store: DataStore, slug: string, displayName: string): string {
    const orgId = crypto.randomUUID();
    store.organizations.write({
        org_id: orgId,
        slug,
        display_name: displayName,
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
        created_by_user_id: crypto.randomUUID(),
        verification_status: "unverified",
    });
    store.state.updateState((s) => {
        s.organizations.push({ org_id: orgId, slug, path: `./organizations/${orgId}.md` });
    });
    return orgId;
}

function seedMembership(
    store: DataStore,
    userId: string,
    orgId: string,
    role: "org_admin" | "org_member" | "org_viewer" = "org_admin",
    status: "active" | "suspended" | "revoked" = "active",
): string {
    const membershipId = crypto.randomUUID();
    store.memberships.write({
        membership_id: membershipId,
        org_id: orgId,
        user_principal_id: userId,
        role,
        status,
        invited_by_user_id: null,
        created_at: new Date().toISOString(),
    });
    store.state.updateState((s) => {
        s.memberships.push({
            membership_id: membershipId,
            org_id: orgId,
            user_principal_id: userId,
            role,
            path: `./memberships/${membershipId}.json`,
        });
    });
    return membershipId;
}

function fakeSession(userId: string): SessionClaims {
    return {
        iss: "test",
        kid: "test",
        sub: userId,
        iat: new Date().toISOString(),
        exp: new Date(Date.now() + 3600_000).toISOString(),
        purpose: "user_session",
    };
}

describe("cookie helpers", () => {
    it("round-trips a personal scope", () => {
        const v = encodeScopeCookie({ type: "user", id: "u1", display_name: "Alice" });
        expect(v).toBe("personal");
        expect(decodeScopeCookie(v)).toEqual({ type: "personal" });
    });

    it("round-trips an org scope using its slug", () => {
        const v = encodeScopeCookie({
            type: "org",
            id: "o1",
            slug: "acme-corp",
            display_name: "Acme",
            role: "org_admin",
        });
        expect(v).toBe("org:acme-corp");
        expect(decodeScopeCookie(v)).toEqual({ type: "org", slug: "acme-corp" });
    });

    it("returns null for malformed or missing cookies", () => {
        expect(decodeScopeCookie(undefined)).toBeNull();
        expect(decodeScopeCookie("")).toBeNull();
        expect(decodeScopeCookie("garbage")).toBeNull();
        expect(decodeScopeCookie("org:")).toBeNull();
    });

    it("reads the cookie value out of a Cookie header", () => {
        const req = makeRequest("/gui/dashboard", "other=1; openleash_last_scope=org%3Aacme; foo=bar");
        expect(readLastScopeCookie(req)).toBe("org:acme");
    });

    it("writes the cookie with HttpOnly and Path=/gui", () => {
        const { reply, headers } = makeReply();
        writeLastScopeCookie(reply, { type: "user", id: "u1", display_name: "Alice" });
        expect(headers["Set-Cookie"]).toContain("openleash_last_scope=personal");
        expect(headers["Set-Cookie"]).toContain("Path=/gui");
        expect(headers["Set-Cookie"]).toContain("HttpOnly");
        expect(headers["Set-Cookie"]).toContain("SameSite=Lax");
    });
});

describe("buildAvailableScopes + resolveCurrentScope", () => {
    let dataDir: string;
    let store: DataStore;
    let userId: string;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-scope-"));
        store = createFileDataStore(dataDir);
        store.initialize();
        userId = seedUser(store, "Alice");
    });

    afterEach(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it("lists personal plus every active org", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        seedOrg(store, "beta", "Beta"); // user is NOT a member of this one
        seedMembership(store, userId, orgA);

        const built = buildAvailableScopes(store, fakeSession(userId));
        expect(built.personal.type).toBe("user");
        expect(built.orgs.map((s) => s.type === "org" ? s.slug : null)).toEqual(["acme"]);
    });

    it("excludes non-active memberships", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        const orgB = seedOrg(store, "beta", "Beta");
        seedMembership(store, userId, orgA, "org_admin", "active");
        seedMembership(store, userId, orgB, "org_member", "revoked");

        const built = buildAvailableScopes(store, fakeSession(userId));
        expect(built.orgs).toHaveLength(1);
        expect(built.orgs[0].type === "org" && built.orgs[0].slug).toBe("acme");
    });

    it("defaults to personal when nothing forces a different scope", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        seedMembership(store, userId, orgA);

        const scope = resolveCurrentScope(store, fakeSession(userId), makeRequest("/gui/dashboard"));
        expect(scope?.current.type).toBe("user");
        expect(scope?.hasOrgs).toBe(true);
    });

    it("resolves org scope from /gui/orgs/:slug URL", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        seedMembership(store, userId, orgA);

        const scope = resolveCurrentScope(store, fakeSession(userId), makeRequest("/gui/orgs/acme"));
        expect(scope?.current.type).toBe("org");
        expect(scope?.current.type === "org" && scope.current.slug).toBe("acme");
    });

    it("resolves org scope from /gui/organizations/:orgId URL", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        seedMembership(store, userId, orgA);

        const scope = resolveCurrentScope(
            store,
            fakeSession(userId),
            makeRequest(`/gui/organizations/${orgA}`),
        );
        expect(scope?.current.type).toBe("org");
        expect(scope?.current.id).toBe(orgA);
    });

    it("falls back to personal when URL references an org the user isn't a member of", () => {
        const orgA = seedOrg(store, "acme", "Acme"); // user is not a member
        expect(orgA).toBeTruthy();

        const scope = resolveCurrentScope(store, fakeSession(userId), makeRequest("/gui/orgs/acme"));
        expect(scope?.current.type).toBe("user");
    });

    it("uses last_scope cookie when URL is neutral", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        seedMembership(store, userId, orgA);

        const scope = resolveCurrentScope(
            store,
            fakeSession(userId),
            makeRequest("/gui/dashboard", "openleash_last_scope=org%3Aacme"),
        );
        expect(scope?.current.type).toBe("org");
        expect(scope?.current.type === "org" && scope.current.slug).toBe("acme");
    });

    it("ignores a stale cookie pointing at an org the user no longer belongs to", () => {
        const orgA = seedOrg(store, "acme", "Acme");
        seedMembership(store, userId, orgA, "org_admin", "revoked");

        const scope = resolveCurrentScope(
            store,
            fakeSession(userId),
            makeRequest("/gui/dashboard", "openleash_last_scope=org%3Aacme"),
        );
        expect(scope?.current.type).toBe("user");
    });
});
