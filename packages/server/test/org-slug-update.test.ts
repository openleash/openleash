import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { bootstrapState } from "../src/bootstrap.js";
import {
    createFileDataStore,
    issueSessionToken,
    readKeyFile,
    readState,
} from "@openleash/core";
import type { DataStore } from "@openleash/core";
import type { FastifyInstance } from "fastify";

/**
 * End-to-end coverage for the PUT /v1/owner/organizations/:orgId slug-update
 * path. Validates that slug renames are rejected when invalid or colliding,
 * push the old slug to slug_history, and keep the state index in sync.
 */

async function sessionCookieFor(dataDir: string, userId: string, orgId: string): Promise<string> {
    const state = readState(dataDir);
    const kid = state.server_keys.active_kid;
    const key = readKeyFile(dataDir, kid);
    const { token } = await issueSessionToken({
        key,
        userPrincipalId: userId,
        ttlSeconds: 3600,
        orgMemberships: [{ org_id: orgId, role: "org_admin" }],
    });
    return `openleash_session=${token}`;
}

describe("PUT /v1/owner/organizations/:orgId slug update", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let orgId: string;
    let otherOrgId: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-slug-update-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        userId = crypto.randomUUID();
        store.users.write({
            user_principal_id: userId,
            display_name: "Alice",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });

        orgId = crypto.randomUUID();
        store.organizations.write({
            org_id: orgId,
            slug: "acme",
            display_name: "Acme",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: userId,
            verification_status: "unverified",
        });

        otherOrgId = crypto.randomUUID();
        store.organizations.write({
            org_id: otherOrgId,
            slug: "beta",
            display_name: "Beta",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: userId,
            verification_status: "unverified",
        });

        const membershipId = crypto.randomUUID();
        store.memberships.write({
            membership_id: membershipId,
            org_id: orgId,
            user_principal_id: userId,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });

        store.state.updateState((s) => {
            s.users.push({ user_principal_id: userId, path: `./users/${userId}.md` });
            s.organizations.push({ org_id: orgId, slug: "acme", path: `./organizations/${orgId}.md` });
            s.organizations.push({ org_id: otherOrgId, slug: "beta", path: `./organizations/${otherOrgId}.md` });
            s.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: userId,
                role: "org_admin",
                path: `./memberships/${membershipId}.json`,
            });
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("updates slug, pushes old slug to history, and keeps state index in sync", async () => {
        const cookie = await sessionCookieFor(dataDir, userId, orgId);
        const res = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}`,
            headers: { cookie, "content-type": "application/json" },
            payload: { slug: "acme-corp" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { slug: string; slug_changed?: boolean; previous_slug?: string };
        expect(body.slug).toBe("acme-corp");
        expect(body.slug_changed).toBe(true);
        expect(body.previous_slug).toBe("acme");

        // File and state agree on new slug
        const org = store.organizations.read(orgId);
        expect(org.slug).toBe("acme-corp");
        expect(org.slug_history).toEqual(["acme"]);

        const stateEntry = store.state.getState().organizations.find((e) => e.org_id === orgId);
        expect(stateEntry?.slug).toBe("acme-corp");

        // Old slug still resolves
        expect(store.organizations.readBySlug("acme")?.org_id).toBe(orgId);
        // New slug resolves to same org
        expect(store.organizations.readBySlug("acme-corp")?.org_id).toBe(orgId);
    });

    it("rejects a collision with another org's current slug", async () => {
        const cookie = await sessionCookieFor(dataDir, userId, orgId);
        const res = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}`,
            headers: { cookie, "content-type": "application/json" },
            payload: { slug: "beta" },
        });
        expect(res.statusCode).toBe(409);
        const body = res.json() as { error?: { code?: string } };
        expect(body.error?.code).toBe("SLUG_TAKEN");
    });

    it("rejects reserved and malformed slugs with 400", async () => {
        const cookie = await sessionCookieFor(dataDir, userId, orgId);

        const reserved = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}`,
            headers: { cookie, "content-type": "application/json" },
            payload: { slug: "personal" },
        });
        expect(reserved.statusCode).toBe(400);

        const malformed = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}`,
            headers: { cookie, "content-type": "application/json" },
            payload: { slug: "Not Valid" },
        });
        expect(malformed.statusCode).toBe(400);
    });

    it("is a no-op when the submitted slug equals the current slug", async () => {
        const current = store.organizations.read(orgId);
        const prevHistoryLen = current.slug_history?.length ?? 0;

        const cookie = await sessionCookieFor(dataDir, userId, orgId);
        const res = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}`,
            headers: { cookie, "content-type": "application/json" },
            payload: { slug: current.slug },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { slug_changed?: boolean };
        expect(body.slug_changed).toBeUndefined();

        const after = store.organizations.read(orgId);
        expect(after.slug).toBe(current.slug);
        expect((after.slug_history ?? []).length).toBe(prevHistoryLen);
    });

    it("allows reclaiming a slug that's only in another org's history", async () => {
        // Rename otherOrg to free up "beta" in history.
        const otherCookie = await sessionCookieFor(dataDir, userId, otherOrgId);
        // Grant temporary admin access to otherOrg for this test by writing a membership.
        const memId = crypto.randomUUID();
        store.memberships.write({
            membership_id: memId,
            org_id: otherOrgId,
            user_principal_id: userId,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });
        store.state.updateState((s) => {
            s.memberships.push({
                membership_id: memId,
                org_id: otherOrgId,
                user_principal_id: userId,
                role: "org_admin",
                path: `./memberships/${memId}.json`,
            });
        });

        const renameOther = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${otherOrgId}`,
            headers: { cookie: otherCookie, "content-type": "application/json" },
            payload: { slug: "beta-gamma" },
        });
        expect(renameOther.statusCode).toBe(200);

        // Now "beta" is only in otherOrg's history — our primary org should be
        // able to claim it.
        const primaryCookie = await sessionCookieFor(dataDir, userId, orgId);
        const claim = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}`,
            headers: { cookie: primaryCookie, "content-type": "application/json" },
            payload: { slug: "beta" },
        });
        expect(claim.statusCode).toBe(200);
        expect(store.organizations.read(orgId).slug).toBe("beta");
        // Direct lookup returns the reclaiming org, not the original holder.
        expect(store.organizations.readBySlug("beta")?.org_id).toBe(orgId);
    });
});
