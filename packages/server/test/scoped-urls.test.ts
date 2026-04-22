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
 * Phase 5 registered every owner list/detail page at three URL patterns:
 *   - legacy /gui/<page> (cookie-driven scope)
 *   - /gui/personal/<page> (explicit personal scope)
 *   - /gui/orgs/:slug/<page> (URL-locked org scope)
 *
 * These tests verify the URL truly drives scope, slug validation works, and
 * the preHandler 404s unknown/unreachable orgs without leaking existence.
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

describe("scoped URL routing (Phase 5)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let memberId: string;
    let outsiderId: string;
    let orgId: string;
    let orgSlug: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-scoped-urls-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        memberId = crypto.randomUUID();
        outsiderId = crypto.randomUUID();
        store.users.write({
            user_principal_id: memberId,
            display_name: "Member",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        store.users.write({
            user_principal_id: outsiderId,
            display_name: "Outsider",
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
            created_by_user_id: memberId,
            verification_status: "unverified",
        });

        const membershipId = crypto.randomUUID();
        store.memberships.write({
            membership_id: membershipId,
            org_id: orgId,
            user_principal_id: memberId,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });

        // Personal agent for member (1)
        const personalAgent = crypto.randomUUID();
        store.agents.write({
            agent_principal_id: personalAgent,
            agent_id: "personal-bot",
            owner_type: "user",
            owner_id: memberId,
            public_key_b64: "dummy",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
        });

        // Org agents (2)
        const orgAgentA = crypto.randomUUID();
        const orgAgentB = crypto.randomUUID();
        for (const [pid, id] of [[orgAgentA, "org-bot-a"], [orgAgentB, "org-bot-b"]] as const) {
            store.agents.write({
                agent_principal_id: pid,
                agent_id: id,
                owner_type: "org",
                owner_id: orgId,
                public_key_b64: "dummy",
                status: "ACTIVE",
                attributes: {},
                created_at: new Date().toISOString(),
                revoked_at: null,
                webhook_url: "",
            });
        }

        store.state.updateState((s) => {
            s.users.push(
                { user_principal_id: memberId, path: `./users/${memberId}.md` },
                { user_principal_id: outsiderId, path: `./users/${outsiderId}.md` },
            );
            s.organizations.push({ org_id: orgId, slug: orgSlug, path: `./organizations/${orgId}.md` });
            s.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: memberId,
                role: "org_admin",
                path: `./memberships/${membershipId}.json`,
            });
            s.agents.push(
                { agent_principal_id: personalAgent, agent_id: "personal-bot", owner_type: "user", owner_id: memberId, path: `./agents/${personalAgent}.md` },
                { agent_principal_id: orgAgentA, agent_id: "org-bot-a", owner_type: "org", owner_id: orgId, path: `./agents/${orgAgentA}.md` },
                { agent_principal_id: orgAgentB, agent_id: "org-bot-b", owner_type: "org", owner_id: orgId, path: `./agents/${orgAgentB}.md` },
            );
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("/gui/personal/agents always shows personal agents, even with an org cookie", async () => {
        const cookie = await sessionCookieFor(dataDir, memberId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/agents",
            // Cookie says org — URL must win.
            headers: { cookie: `${cookie}; openleash_last_scope=org%3A${orgSlug}` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("personal-bot");
        expect(res.body).not.toContain("org-bot-a");
    });

    it("/gui/orgs/:slug/agents shows org agents regardless of cookie", async () => {
        const cookie = await sessionCookieFor(dataDir, memberId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/agents`,
            headers: { cookie: `${cookie}; openleash_last_scope=personal` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("org-bot-a");
        expect(res.body).toContain("org-bot-b");
        expect(res.body).not.toContain("personal-bot");
    });

    it("/gui/orgs/<historical-slug>/agents redirects to current slug", async () => {
        const cookie = await sessionCookieFor(dataDir, memberId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/orgs/old-acme/agents",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe(`/gui/orgs/${orgSlug}/agents`);
    });

    it("/gui/orgs/<unknown-slug>/agents returns 404", async () => {
        const cookie = await sessionCookieFor(dataDir, memberId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/orgs/does-not-exist/agents",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(404);
    });

    it("/gui/orgs/:slug/agents returns 404 for non-members (existence not leaked)", async () => {
        const cookie = await sessionCookieFor(dataDir, outsiderId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/agents`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(404);
    });

    it("scoped dashboard URLs work for both personal and org scope", async () => {
        const cookie = await sessionCookieFor(dataDir, memberId);
        const personal = await app.inject({
            method: "GET",
            url: "/gui/personal/dashboard",
            headers: { cookie },
        });
        const org = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/dashboard`,
            headers: { cookie },
        });
        expect(personal.statusCode).toBe(200);
        expect(org.statusCode).toBe(200);
        // Org dashboard should reference the org's display name
        expect(org.body).toContain("Acme");
    });

    it("legacy /gui/agents 302s to the scoped URL that matches the cookie", async () => {
        const cookie = await sessionCookieFor(dataDir, memberId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/agents",
            headers: { cookie: `${cookie}; openleash_last_scope=org%3A${orgSlug}` },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe(`/gui/orgs/${orgSlug}/agents`);
    });
});
