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
 * GET /v1/owner/audit — `agent_principal_id` + `since` filters that back the
 * agent activity drawer. The single-agent view returns only events about that
 * agent (after an ownership check), and `since` caps the window and nulls the
 * cursor once it crosses the boundary.
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

/** Append a raw audit line with a controlled timestamp (append() can't backdate). */
function rawAudit(
    dataDir: string,
    eventType: string,
    agentPrincipalId: string,
    timestamp: string,
): void {
    const event = {
        event_id: crypto.randomUUID(),
        timestamp,
        event_type: eventType,
        principal_id: agentPrincipalId,
        action_id: null,
        decision_id: null,
        metadata_json: { agent_principal_id: agentPrincipalId, action_type: "read" },
    };
    fs.appendFileSync(
        path.join(dataDir, "audit.log.jsonl"),
        JSON.stringify(event) + "\n",
        "utf-8",
    );
}

function seedAgent(
    store: DataStore,
    pid: string,
    agentId: string,
    ownerType: "user" | "org",
    ownerId: string,
): void {
    store.agents.write({
        agent_principal_id: pid,
        agent_id: agentId,
        owner_type: ownerType,
        owner_id: ownerId,
        public_key_b64: "dummy",
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
        revoked_at: null,
        webhook_url: "",
    });
    store.state.updateState((s) => {
        s.agents.push({
            agent_principal_id: pid,
            agent_id: agentId,
            owner_type: ownerType,
            owner_id: ownerId,
            path: `./agents/${pid}.md`,
        });
    });
}

describe("GET /v1/owner/audit (agent_principal_id + since)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let otherUserId: string;
    let agentA: string;
    let agentB: string;
    let otherAgent: string;
    let orgId: string;
    let orgAgent: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-audit-filter-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        const store = createFileDataStore(dataDir);

        userId = crypto.randomUUID();
        otherUserId = crypto.randomUUID();
        for (const [id, name] of [
            [userId, "Alice"],
            [otherUserId, "Bob"],
        ] as const) {
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
        }

        agentA = crypto.randomUUID();
        agentB = crypto.randomUUID();
        otherAgent = crypto.randomUUID();
        seedAgent(store, agentA, "agent-a", "user", userId);
        seedAgent(store, agentB, "agent-b", "user", userId);
        seedAgent(store, otherAgent, "bob-bot", "user", otherUserId);

        // Org that Alice is an active member of, with an org-owned agent.
        // The session helper issues a token WITHOUT org_memberships claims —
        // exactly the hosted-mode shape — so this guards the regression where
        // org-agent access was (wrongly) gated on session.org_memberships.
        orgId = crypto.randomUUID();
        orgAgent = crypto.randomUUID();
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
        seedAgent(store, orgAgent, "org-bot", "org", orgId);
        store.state.updateState((s) => {
            s.organizations.push({ org_id: orgId, slug: "acme", path: `./organizations/${orgId}.md` });
            s.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: userId,
                role: "org_admin",
                path: `./memberships/${membershipId}.json`,
            });
        });

        const now = Date.now();
        const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
        // agentA: oldest first so newest line = most recent event.
        rawAudit(dataDir, "AGENT_REGISTERED", agentA, iso(48 * 3600 * 1000)); // 48h ago
        rawAudit(dataDir, "AUTHORIZE_CALLED", agentA, iso(2 * 3600 * 1000)); // 2h ago
        rawAudit(dataDir, "APPROVAL_REQUEST_CREATED", agentA, iso(1 * 3600 * 1000)); // 1h ago
        // agentB: one recent event, must never appear in agentA's view.
        rawAudit(dataDir, "AUTHORIZE_CALLED", agentB, iso(30 * 60 * 1000)); // 30m ago
        // org agent event
        rawAudit(dataDir, "AUTHORIZE_CALLED", orgAgent, iso(20 * 60 * 1000)); // 20m ago

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("returns only the selected agent's events, newest-first", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/audit?agent_principal_id=${agentA}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { items: Array<{ event_type: string }> };
        expect(body.items).toHaveLength(3);
        // newest-first
        expect(body.items[0].event_type).toBe("APPROVAL_REQUEST_CREATED");
        expect(body.items[2].event_type).toBe("AGENT_REGISTERED");
        // never leaks agent B's event
        expect(body.items.some((i) => i.event_type === "AUTHORIZE_CALLED")).toBe(true);
    });

    it("since caps the window and nulls the cursor once it crosses the boundary", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/audit?agent_principal_id=${agentA}&since=${encodeURIComponent(since)}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as {
            items: Array<{ event_type: string }>;
            next_cursor: string | null;
        };
        // drops the 48h-old AGENT_REGISTERED
        expect(body.items).toHaveLength(2);
        expect(body.items.some((i) => i.event_type === "AGENT_REGISTERED")).toBe(false);
        expect(body.next_cursor).toBeNull();
    });

    it("lets an org member read an org-owned agent's feed (no org_memberships in session)", async () => {
        // Regression: org-agent access must resolve membership from the store,
        // not session claims — hosted-mode sessions carry no org_memberships.
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/audit?agent_principal_id=${orgAgent}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { items: Array<{ event_type: string }> };
        expect(body.items).toHaveLength(1);
        expect(body.items[0].event_type).toBe("AUTHORIZE_CALLED");
    });

    it("403s an org agent for a non-member", async () => {
        const cookie = await sessionCookieFor(dataDir, otherUserId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/audit?agent_principal_id=${orgAgent}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(403);
    });

    it("403s for an agent the caller does not own", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/audit?agent_principal_id=${otherAgent}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(403);
    });

    it("404s for an unknown agent", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/audit?agent_principal_id=${crypto.randomUUID()}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(404);
    });

    it("without agent_principal_id, still returns the owner's combined feed", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/audit",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { items: Array<{ event_type: string }> };
        // both agents' events belong to this owner
        expect(body.items.length).toBeGreaterThanOrEqual(4);
    });
});
