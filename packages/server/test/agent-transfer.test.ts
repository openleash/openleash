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
import type { DataStore, SessionClaims, OrgRole } from "@openleash/core";
import type { FastifyInstance } from "fastify";

async function sessionCookieFor(dataDir: string, userId: string, session?: Partial<SessionClaims>): Promise<string> {
    const state = readState(dataDir);
    const kid = state.server_keys.active_kid;
    const key = readKeyFile(dataDir, kid);
    const { token } = await issueSessionToken({
        key,
        userPrincipalId: userId,
        ttlSeconds: 3600,
        orgMemberships: session?.org_memberships,
    });
    return `openleash_session=${token}`;
}

function seedAgent(store: DataStore, ownerType: "user" | "org", ownerId: string): { agentPrincipalId: string; agentId: string } {
    const agentPrincipalId = crypto.randomUUID();
    const agentId = `agent-${agentPrincipalId.slice(0, 8)}`;
    store.agents.write({
        agent_principal_id: agentPrincipalId,
        agent_id: agentId,
        owner_type: ownerType,
        owner_id: ownerId,
        public_key_b64: "AAAA",
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
        revoked_at: null,
        webhook_url: "",
        webhook_secret: "",
        webhook_auth_token: "",
    });
    store.state.updateState((s) => {
        s.agents.push({
            agent_principal_id: agentPrincipalId,
            agent_id: agentId,
            owner_type: ownerType,
            owner_id: ownerId,
            path: `./agents/${agentPrincipalId}.md`,
        });
    });
    return { agentPrincipalId, agentId };
}

function seedMembership(store: DataStore, orgId: string, userId: string, role: OrgRole): string {
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
    return membershipId;
}

describe("POST /v1/owner/agents/:agentId/transfer", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    let aliceId: string;
    let bobId: string;
    let adminOrgId: string;
    let adminOrgSlug: string;
    let memberOnlyOrgId: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-agent-transfer-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        // Two users — Alice is the one doing the transfer.
        aliceId = crypto.randomUUID();
        store.users.write({
            user_principal_id: aliceId,
            display_name: "Alice",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        bobId = crypto.randomUUID();
        store.users.write({
            user_principal_id: bobId,
            display_name: "Bob",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });

        // Org where Alice is org_admin — valid transfer target.
        adminOrgId = crypto.randomUUID();
        adminOrgSlug = "acme";
        store.organizations.write({
            org_id: adminOrgId,
            slug: adminOrgSlug,
            display_name: "Acme",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: aliceId,
            verification_status: "unverified",
        });

        // Org where Alice is only a member — should be rejected.
        memberOnlyOrgId = crypto.randomUUID();
        store.organizations.write({
            org_id: memberOnlyOrgId,
            slug: "widget-co",
            display_name: "Widget Co",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: bobId,
            verification_status: "unverified",
        });

        store.state.updateState((s) => {
            s.users.push({ user_principal_id: aliceId, path: `./users/${aliceId}.md` });
            s.users.push({ user_principal_id: bobId, path: `./users/${bobId}.md` });
            s.organizations.push({ org_id: adminOrgId, slug: adminOrgSlug, path: `./organizations/${adminOrgId}.md` });
            s.organizations.push({ org_id: memberOnlyOrgId, slug: "widget-co", path: `./organizations/${memberOnlyOrgId}.md` });
        });

        seedMembership(store, adminOrgId, aliceId, "org_admin");
        seedMembership(store, memberOnlyOrgId, aliceId, "org_member");

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("happy path: transfers a personal agent to an org the caller admins", async () => {
        const { agentPrincipalId, agentId } = seedAgent(store, "user", aliceId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: adminOrgId },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as Record<string, unknown>;
        expect(body.agent_principal_id).toBe(agentPrincipalId);
        expect(body.agent_id).toBe(agentId);
        expect(body.owner_type).toBe("org");
        expect(body.owner_id).toBe(adminOrgId);
        expect(body.target_org_slug).toBe(adminOrgSlug);

        // Agent file updated.
        const agent = store.agents.read(agentPrincipalId);
        expect(agent.owner_type).toBe("org");
        expect(agent.owner_id).toBe(adminOrgId);

        // State index updated.
        const entry = store.state.getState().agents.find((a) => a.agent_principal_id === agentPrincipalId);
        expect(entry).toBeDefined();
        expect(entry?.owner_type).toBe("org");
        expect(entry?.owner_id).toBe(adminOrgId);
    });

    it("returns 400 when target_org_id is missing", async () => {
        const { agentPrincipalId } = seedAgent(store, "user", aliceId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: {},
        });

        expect(res.statusCode).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe("INVALID_BODY");
    });

    it("returns 404 when the agent does not exist", async () => {
        const cookie = await sessionCookieFor(dataDir, aliceId);
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${crypto.randomUUID()}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: adminOrgId },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 404 when caller does not own the agent personally", async () => {
        const { agentPrincipalId } = seedAgent(store, "user", bobId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: adminOrgId },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 404 when the agent is already owned by an org", async () => {
        const { agentPrincipalId } = seedAgent(store, "org", adminOrgId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: adminOrgId },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 404 when the target org does not exist", async () => {
        const { agentPrincipalId } = seedAgent(store, "user", aliceId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: crypto.randomUUID() },
        });

        expect(res.statusCode).toBe(404);
    });

    it("returns 403 when caller is not org_admin of the target org", async () => {
        const { agentPrincipalId } = seedAgent(store, "user", aliceId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: memberOnlyOrgId },
        });

        expect(res.statusCode).toBe(403);
        expect((res.json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    });

    it("appends an AGENT_TRANSFERRED audit event", async () => {
        const { agentPrincipalId } = seedAgent(store, "user", aliceId);
        const cookie = await sessionCookieFor(dataDir, aliceId);

        const before = store.audit.readByPrincipal(aliceId, new Set(), 1000, 0).total;

        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/agents/${agentPrincipalId}/transfer`,
            headers: { cookie, "content-type": "application/json" },
            payload: { target_org_id: adminOrgId },
        });
        expect(res.statusCode).toBe(200);

        const after = store.audit.readByPrincipal(aliceId, new Set(), 1000, 0);
        expect(after.total).toBe(before + 1);
        const latest = after.items[after.items.length - 1];
        expect(latest.event_type).toBe("AGENT_TRANSFERRED");
        expect(latest.metadata_json).toMatchObject({
            agent_principal_id: agentPrincipalId,
            from_owner_type: "user",
            from_owner_id: aliceId,
            to_owner_type: "org",
            to_owner_id: adminOrgId,
        });
    });
});
