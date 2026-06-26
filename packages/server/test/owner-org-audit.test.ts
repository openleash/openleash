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
 * GET /v1/owner/organizations/:orgId/audit — the org audit log for the mobile
 * Audit Log tab. Returns events attributed to the org principal plus events
 * about agents the org owns; any active member (org_viewer and up) may read it.
 * Sessions carry NO org_memberships claims (hosted-mode shape), so membership
 * is resolved from the store.
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

/** Append a raw audit line with a controlled timestamp + principal. */
function rawAudit(
    dataDir: string,
    eventType: string,
    principalId: string,
    timestamp: string,
): void {
    const event = {
        event_id: crypto.randomUUID(),
        timestamp,
        event_type: eventType,
        principal_id: principalId,
        action_id: null,
        decision_id: null,
        metadata_json: { principal_id: principalId, action_type: "read" },
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

function seedUser(store: DataStore, id: string, name: string): void {
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

function seedOrg(store: DataStore, orgId: string, slug: string, createdBy: string): void {
    store.organizations.write({
        org_id: orgId,
        slug,
        display_name: slug,
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
        created_by_user_id: createdBy,
        verification_status: "unverified",
    });
    store.state.updateState((s) => {
        s.organizations.push({ org_id: orgId, slug, path: `./organizations/${orgId}.md` });
    });
}

function seedMembership(
    store: DataStore,
    orgId: string,
    userId: string,
    role: "org_admin" | "org_viewer",
): void {
    const membershipId = crypto.randomUUID();
    store.memberships.write({
        membership_id: membershipId,
        org_id: orgId,
        user_principal_id: userId,
        role,
        status: "active",
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
}

describe("GET /v1/owner/organizations/:orgId/audit", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let adminUserId: string;
    let viewerUserId: string;
    let outsiderUserId: string;
    let orgId: string;
    let orgAgent: string;
    let otherOrgId: string;
    let otherOrgAgent: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-org-audit-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        const store = createFileDataStore(dataDir);

        adminUserId = crypto.randomUUID();
        viewerUserId = crypto.randomUUID();
        outsiderUserId = crypto.randomUUID();
        seedUser(store, adminUserId, "Admin");
        seedUser(store, viewerUserId, "Viewer");
        seedUser(store, outsiderUserId, "Outsider");

        orgId = crypto.randomUUID();
        otherOrgId = crypto.randomUUID();
        seedOrg(store, orgId, "acme", adminUserId);
        seedOrg(store, otherOrgId, "globex", outsiderUserId);

        // adminUser + viewerUser belong to acme; outsider belongs to globex only.
        seedMembership(store, orgId, adminUserId, "org_admin");
        seedMembership(store, orgId, viewerUserId, "org_viewer");
        seedMembership(store, otherOrgId, outsiderUserId, "org_admin");

        orgAgent = crypto.randomUUID();
        otherOrgAgent = crypto.randomUUID();
        seedAgent(store, orgAgent, "acme-bot", "org", orgId);
        seedAgent(store, otherOrgAgent, "globex-bot", "org", otherOrgId);

        const now = Date.now();
        const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
        // acme: an event on the org principal + events about the org's agent.
        rawAudit(dataDir, "ORG_CREATED", orgId, iso(48 * 3600 * 1000)); // 48h ago
        rawAudit(dataDir, "AUTHORIZE_CALLED", orgAgent, iso(2 * 3600 * 1000)); // 2h ago
        rawAudit(dataDir, "APPROVAL_REQUEST_CREATED", orgAgent, iso(1 * 3600 * 1000)); // 1h ago
        // globex: must never appear in acme's view.
        rawAudit(dataDir, "AUTHORIZE_CALLED", otherOrgAgent, iso(30 * 60 * 1000));
        rawAudit(dataDir, "ORG_CREATED", otherOrgId, iso(31 * 60 * 1000));

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("returns the org's events (principal + owned agents), newest-first", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/audit`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { items: Array<{ event_type: string }> };
        expect(body.items).toHaveLength(3);
        expect(body.items[0].event_type).toBe("APPROVAL_REQUEST_CREATED");
        expect(body.items[2].event_type).toBe("ORG_CREATED");
    });

    it("excludes events from other organizations", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/audit`,
            headers: { cookie },
        });
        const body = res.json() as { items: Array<{ principal_id: string | null }> };
        expect(body.items.some((i) => i.principal_id === otherOrgAgent)).toBe(false);
        expect(body.items.some((i) => i.principal_id === otherOrgId)).toBe(false);
    });

    it("lets an org_viewer member read the org audit log", async () => {
        const cookie = await sessionCookieFor(dataDir, viewerUserId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/audit`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { items: unknown[] };
        expect(body.items).toHaveLength(3);
    });

    it("since caps the window and nulls the cursor at the boundary", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/audit?since=${encodeURIComponent(since)}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as {
            items: Array<{ event_type: string }>;
            next_cursor: string | null;
        };
        // drops the 48h-old ORG_CREATED
        expect(body.items).toHaveLength(2);
        expect(body.items.some((i) => i.event_type === "ORG_CREATED")).toBe(false);
        expect(body.next_cursor).toBeNull();
    });

    it("403s a non-member", async () => {
        const cookie = await sessionCookieFor(dataDir, outsiderUserId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/audit`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(403);
    });

    it("403s an unknown org (does not leak existence)", async () => {
        const cookie = await sessionCookieFor(dataDir, adminUserId);
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${crypto.randomUUID()}/audit`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(403);
    });
});
