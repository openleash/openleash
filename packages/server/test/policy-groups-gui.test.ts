/**
 * Smoke tests for the policy groups GUI pages. Focus: the list and
 * detail routes render HTML containing expected page markers. Deeper
 * UX / DOM assertions belong in a browser test harness we don't have
 * yet; these tests catch obvious regressions (500s, missing page data,
 * broken data shape) without spinning up a headless browser.
 */
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

async function sessionCookieFor(dataDir: string, userId: string): Promise<string> {
    const state = readState(dataDir);
    const kid = state.server_keys.active_kid;
    const key = readKeyFile(dataDir, kid);
    const { token } = await issueSessionToken({ key, userPrincipalId: userId, ttlSeconds: 3600 });
    return `openleash_session=${token}`;
}

describe("Policy groups GUI pages — render smoke tests", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    const adminUserId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const orgSlug = "acme";
    let groupId: string;
    const groupSlug = "engineering";

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-policy-groups-gui-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        store.users.write({
            user_principal_id: adminUserId,
            display_name: "Admin",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        store.organizations.write({
            org_id: orgId,
            slug: orgSlug,
            display_name: "Acme",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: adminUserId,
            verification_status: "unverified",
        });
        const membershipId = crypto.randomUUID();
        store.memberships.write({
            membership_id: membershipId,
            org_id: orgId,
            user_principal_id: adminUserId,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });

        groupId = crypto.randomUUID();
        store.policyGroups.write({
            group_id: groupId,
            owner_type: "org",
            owner_id: orgId,
            name: "Engineering",
            slug: groupSlug,
            description: "Backend engineering agents",
            created_at: new Date().toISOString(),
            created_by_user_id: adminUserId,
        });

        store.state.updateState((s) => {
            s.users.push({ user_principal_id: adminUserId, path: `./users/${adminUserId}.md` });
            s.organizations.push({ org_id: orgId, slug: orgSlug, path: `./organizations/${orgId}.md` });
            s.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: adminUserId,
                role: "org_admin",
                path: `./memberships/${membershipId}.json`,
            });
            if (!s.policy_groups) s.policy_groups = [];
            s.policy_groups.push({
                group_id: groupId,
                owner_type: "org",
                owner_id: orgId,
                name: "Engineering",
                slug: groupSlug,
                path: `./policy-groups/${groupId}.json`,
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

    it("list page renders for org scope and shows the group", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Policy Groups");
        expect(res.body).toContain("Engineering");
        // Sidebar nav entry highlighted.
        expect(res.body).toContain("group_work");
    });

    it("list page redirects to /gui/orgs when accessed in personal scope", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/personal/policy-groups`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/gui/orgs");
    });

    it("detail page renders members and bound-policies sections", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups/${groupSlug}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Engineering");
        expect(res.body).toContain("Backend engineering agents");
        expect(res.body).toContain("Members");
        expect(res.body).toContain("Bound policies");
    });

    it("detail page 404s for unknown slug", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups/does-not-exist`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(404);
    });

    it("policy-create page in org scope renders the scope selector + group options", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policies/create`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Applies to");
        expect(res.body).toContain("A policy group");
        expect(res.body).toContain("Engineering");
    });

    it("policy-create in personal scope does not show the group selector", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/personal/policies/create`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).not.toContain("A policy group");
    });
});
