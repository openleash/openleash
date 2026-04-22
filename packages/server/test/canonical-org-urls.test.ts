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
 * Phase 6 flip: /gui/orgs/:slug is the canonical org detail URL; /gui/orgs
 * is the canonical org list. Legacy /gui/organizations[/:orgId] redirect to
 * the new paths. These tests verify the canonical URLs render the page and
 * legacy URLs redirect cleanly.
 */

async function sessionCookieFor(dataDir: string, userId: string): Promise<string> {
    const state = readState(dataDir);
    const kid = state.server_keys.active_kid;
    const key = readKeyFile(dataDir, kid);
    const { token } = await issueSessionToken({
        key,
        userPrincipalId: userId,
        ttlSeconds: 3600,
    });
    return `openleash_session=${token}`;
}

describe("canonical org URLs (Phase 6)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let orgId: string;
    let orgSlug: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-canonical-orgs-"));
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
        orgSlug = "acme";
        store.organizations.write({
            org_id: orgId,
            slug: orgSlug,
            slug_history: ["old-acme"],
            display_name: "Acme",
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
            s.organizations.push({ org_id: orgId, slug: orgSlug, path: `./organizations/${orgId}.md` });
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

    it("GET /gui/orgs/:slug renders org detail (not a redirect)", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Acme");
        // Body should contain the slug display element we added in Phase 4.
        expect(res.body).toContain(orgSlug);
    });

    it("GET /gui/organizations/:orgId redirects to /gui/orgs/:slug", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/organizations/${orgId}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe(`/gui/orgs/${orgSlug}`);
    });

    it("GET /gui/organizations (list) redirects to /gui/orgs", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/organizations",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/gui/orgs");
    });

    it("GET /gui/orgs renders the org list page", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/orgs",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Acme");
        // Link to the org should use the canonical slug URL.
        expect(res.body).toContain(`/gui/orgs/${orgSlug}`);
    });

    it("GET /gui/orgs/<historical-slug> still redirects to current slug", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/orgs/old-acme",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe(`/gui/orgs/${orgSlug}`);
    });
});
