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
 * Phase 10 changed legacy owner URLs (`/gui/<page>`) from cookie-driven
 * handlers into 302 redirects to the scoped URL that matches the current
 * scope. The URL bar always matches what's rendered — no more silent
 * cookie-driven scope.
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

describe("legacy owner URL redirects (Phase 10)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let orgId: string;
    let orgSlug: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-legacy-redir-"));
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

    it("/gui/dashboard 302s to /gui/personal/dashboard when no cookie", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/dashboard",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/gui/personal/dashboard");
    });

    it("/gui/dashboard 302s to org dashboard when cookie is org", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/dashboard",
            headers: { cookie: `${cookie}; openleash_last_scope=org%3A${orgSlug}` },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe(`/gui/orgs/${orgSlug}/dashboard`);
    });

    it("legacy redirects preserve the query string", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/audit?page=3&page_size=50",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/gui/personal/audit?page=3&page_size=50");
    });

    it("/gui/policies with a stale org cookie falls back to personal", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/policies",
            headers: { cookie: `${cookie}; openleash_last_scope=org%3Adoes-not-exist` },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/gui/personal/policies");
    });

    it("legacy /gui/agents/<id> preserves the param when redirecting", async () => {
        // Regression: the redirect handler used to interpolate the route
        // template (`agents/:agentPrincipalId`) into the target, so users
        // following a stale agent link landed on `/gui/personal/agents/:agentPrincipalId`
        // and got "Agent not found". Verify the actual id is preserved.
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/agents/agent-abc-123",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe("/gui/personal/agents/agent-abc-123");
    });

    it("legacy /gui/agents/<id> preserves the param when redirecting to an org scope", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/agents/agent-xyz-789?tab=audit",
            headers: { cookie: `${cookie}; openleash_last_scope=org%3A${orgSlug}` },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe(`/gui/orgs/${orgSlug}/agents/agent-xyz-789?tab=audit`);
    });

    it("/gui/approvals (cross-scope inbox) renders directly — not redirected", async () => {
        // /gui/approvals was repurposed as the cross-scope inbox in Phase 8
        // and is NOT registered via registerScopedOwnerRoute. It should still
        // render directly rather than 302.
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/approvals",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
    });
});
