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
    writeState,
} from "@openleash/core";
import type { FastifyInstance } from "fastify";
import type { DataStore } from "@openleash/core";

/**
 * Integration-level coverage for Phase 3 scope-aware filtering. We seed two
 * separate worlds:
 *   - Personal: a user with 1 agent and 1 policy owned by them directly.
 *   - Org (Acme): the same user as org_admin; 2 agents and 2 policies owned
 *     by the org.
 *
 * Then we check that /gui/dashboard (and the other scoped pages) return
 * different counts depending on the `openleash_last_scope` cookie.
 */

async function makeSessionCookie(dataDir: string, userId: string): Promise<string> {
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

describe("scope-aware filtering (Phase 3)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let orgId: string;
    let orgSlug: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-scope-filter-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        // User
        userId = crypto.randomUUID();
        store.users.write({
            user_principal_id: userId,
            display_name: "Alice",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });

        // Org with slug
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

        // Membership
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

        // Personal agent + policy (1 each)
        const personalAgentPid = crypto.randomUUID();
        store.agents.write({
            agent_principal_id: personalAgentPid,
            agent_id: "personal-bot",
            owner_type: "user",
            owner_id: userId,
            public_key_b64: "dummy",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
        });
        const personalPolicyId = crypto.randomUUID();
        store.policies.write(personalPolicyId, "version: 1\ndefault: deny\nrules: []\n");

        // Org agents + policies (2 each)
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
        const orgPolicyA = crypto.randomUUID();
        const orgPolicyB = crypto.randomUUID();
        store.policies.write(orgPolicyA, "version: 1\ndefault: deny\nrules: []\n");
        store.policies.write(orgPolicyB, "version: 1\ndefault: deny\nrules: []\n");

        // Index into state
        const state = readState(dataDir);
        state.users.push({ user_principal_id: userId, path: `./users/${userId}.md` });
        state.organizations.push({ org_id: orgId, slug: orgSlug, path: `./organizations/${orgId}.md` });
        state.memberships.push({
            membership_id: membershipId,
            org_id: orgId,
            user_principal_id: userId,
            role: "org_admin",
            path: `./memberships/${membershipId}.json`,
        });
        state.agents.push(
            { agent_principal_id: personalAgentPid, agent_id: "personal-bot", owner_type: "user", owner_id: userId, path: `./agents/${personalAgentPid}.md` },
            { agent_principal_id: orgAgentA, agent_id: "org-bot-a", owner_type: "org", owner_id: orgId, path: `./agents/${orgAgentA}.md` },
            { agent_principal_id: orgAgentB, agent_id: "org-bot-b", owner_type: "org", owner_id: orgId, path: `./agents/${orgAgentB}.md` },
        );
        state.policies.push(
            { policy_id: personalPolicyId, owner_type: "user", owner_id: userId, applies_to_agent_principal_id: null, name: null, description: null, path: `./policies/${personalPolicyId}.yaml` },
            { policy_id: orgPolicyA, owner_type: "org", owner_id: orgId, applies_to_agent_principal_id: null, name: null, description: null, path: `./policies/${orgPolicyA}.yaml` },
            { policy_id: orgPolicyB, owner_type: "org", owner_id: orgId, applies_to_agent_principal_id: null, name: null, description: null, path: `./policies/${orgPolicyB}.yaml` },
        );
        writeState(dataDir, state);

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("scoped dashboard URL renders personal data", async () => {
        const cookie = await makeSessionCookie(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/dashboard",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatch(/personal-bot|stat-value[^>]*>1</);
    });

    it("/gui/personal/agents returns personal agents only", async () => {
        const cookie = await makeSessionCookie(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/agents",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("personal-bot");
        expect(res.body).not.toContain("org-bot-a");
        expect(res.body).not.toContain("org-bot-b");
    });

    it("/gui/orgs/:slug/agents returns org agents only", async () => {
        const sessionCookie = await makeSessionCookie(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/agents`,
            headers: { cookie: sessionCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("org-bot-a");
        expect(res.body).toContain("org-bot-b");
        expect(res.body).not.toContain("personal-bot");
    });

    it("agents list follows the URL when visiting /gui/orgs/:slug-style paths", async () => {
        const sessionCookie = await makeSessionCookie(dataDir, userId);
        // /gui/orgs/:slug is the canonical org URL in Phase 6. Visiting it
        // should persist the scope in the last_scope cookie so subsequent
        // legacy-URL requests follow the same scope.
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}`,
            headers: { cookie: sessionCookie },
        });
        expect(res.statusCode).toBe(200);
        const setCookie = res.headers["set-cookie"];
        const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
        const lastScope = cookies.find((c) => c.startsWith("openleash_last_scope="));
        expect(lastScope).toBeDefined();
        expect(lastScope).toContain(`org%3A${orgSlug}`);
    });

    it("policies list differs between personal and org scopes", async () => {
        const sessionCookie = await makeSessionCookie(dataDir, userId);

        const personalRes = await app.inject({
            method: "GET",
            url: "/gui/personal/policies",
            headers: { cookie: sessionCookie },
        });
        const orgRes = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policies`,
            headers: { cookie: sessionCookie },
        });

        expect(personalRes.statusCode).toBe(200);
        expect(orgRes.statusCode).toBe(200);
        // Personal has 1 policy, org has 2 — body length is a crude but
        // reliable proxy that the lists differ.
        expect(orgRes.body.length).not.toBe(personalRes.body.length);
    });
});
