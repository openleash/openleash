/**
 * CRUD + membership tests for org-scoped policy groups. Covers:
 * - create (slug auto-derive + explicit + conflict + reserved)
 * - list / get with member + bound-policy rollups
 * - update (name, slug rename with conflict)
 * - delete refuses when policies are bound (409 GROUP_HAS_POLICIES)
 * - add / remove agent membership, idempotent add
 * - RBAC: org_viewer can read, only org_admin can mutate
 * - Policy creation with applies_to_group_id, and mutual-exclusion with
 *   applies_to_agent_principal_id
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
import type { DataStore, SessionClaims } from "@openleash/core";
import type { FastifyInstance } from "fastify";

async function sessionCookieFor(
    dataDir: string,
    userId: string,
    session?: Partial<SessionClaims>,
): Promise<string> {
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

describe("Policy groups API — org-scoped CRUD + membership", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    const adminUserId = crypto.randomUUID();
    const viewerUserId = crypto.randomUUID();
    const outsiderUserId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    let orgAgentPid: string;
    let orgAgentId: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-policy-groups-api-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        for (const [id, name] of [
            [adminUserId, "Admin"],
            [viewerUserId, "Viewer"],
            [outsiderUserId, "Outsider"],
        ] as const) {
            store.users.write({
                user_principal_id: id,
                display_name: name,
                status: "ACTIVE",
                attributes: {},
                created_at: new Date().toISOString(),
            });
        }

        store.organizations.write({
            org_id: orgId,
            slug: "acme",
            display_name: "Acme",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: adminUserId,
            verification_status: "unverified",
        });

        orgAgentPid = crypto.randomUUID();
        orgAgentId = "agent-" + orgAgentPid.slice(0, 8);
        store.agents.write({
            agent_principal_id: orgAgentPid,
            agent_id: orgAgentId,
            owner_type: "org",
            owner_id: orgId,
            public_key_b64: "AAAA",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });

        const adminMembershipId = crypto.randomUUID();
        store.memberships.write({
            membership_id: adminMembershipId,
            org_id: orgId,
            user_principal_id: adminUserId,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });
        const viewerMembershipId = crypto.randomUUID();
        store.memberships.write({
            membership_id: viewerMembershipId,
            org_id: orgId,
            user_principal_id: viewerUserId,
            role: "org_viewer",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });

        store.state.updateState((s) => {
            s.users.push(
                { user_principal_id: adminUserId, path: `./users/${adminUserId}.md` },
                { user_principal_id: viewerUserId, path: `./users/${viewerUserId}.md` },
                { user_principal_id: outsiderUserId, path: `./users/${outsiderUserId}.md` },
            );
            s.organizations.push({ org_id: orgId, slug: "acme", path: `./organizations/${orgId}.md` });
            s.agents.push({
                agent_principal_id: orgAgentPid,
                agent_id: orgAgentId,
                owner_type: "org",
                owner_id: orgId,
                path: `./agents/${orgAgentPid}.md`,
            });
            s.memberships.push(
                {
                    membership_id: adminMembershipId,
                    org_id: orgId,
                    user_principal_id: adminUserId,
                    role: "org_admin",
                    path: `./memberships/${adminMembershipId}.json`,
                },
                {
                    membership_id: viewerMembershipId,
                    org_id: orgId,
                    user_principal_id: viewerUserId,
                    role: "org_viewer",
                    path: `./memberships/${viewerMembershipId}.json`,
                },
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

    async function adminCookie() { return sessionCookieFor(dataDir, adminUserId); }
    async function viewerCookie() { return sessionCookieFor(dataDir, viewerUserId); }
    async function outsiderCookie() { return sessionCookieFor(dataDir, outsiderUserId); }

    async function createGroup(body: Record<string, unknown>): Promise<{ group_id: string; slug: string }> {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: body,
        });
        expect(res.statusCode).toBe(200);
        return res.json() as { group_id: string; slug: string };
    }

    it("creates a group with auto-derived slug", async () => {
        const { group_id, slug } = await createGroup({ name: "Customer Support" });
        expect(group_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(slug).toBe("customer-support");
    });

    it("creates a group with an explicit slug", async () => {
        const { slug } = await createGroup({ name: "Finance Team", slug: "finance" });
        expect(slug).toBe("finance");
    });

    it("409 SLUG_TAKEN when the slug already exists in the org", async () => {
        await createGroup({ name: "Support team", slug: "support-a" });
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: { name: "Second support", slug: "support-a" },
        });
        expect(res.statusCode).toBe(409);
        expect((res.json() as { error: { code: string } }).error.code).toBe("SLUG_TAKEN");
    });

    it("400 when name is missing", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: {},
        });
        expect(res.statusCode).toBe(400);
    });

    it("org_viewer can list and get groups", async () => {
        const list = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: await viewerCookie() },
        });
        expect(list.statusCode).toBe(200);
        expect((list.json() as { groups: unknown[] }).groups.length).toBeGreaterThan(0);
    });

    it("outsider gets 403 on list", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: await outsiderCookie() },
        });
        expect(res.statusCode).toBe(403);
    });

    it("org_viewer cannot create a group", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: await viewerCookie(), "content-type": "application/json" },
            payload: { name: "Nope" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("updates name + slug, rejects slug collision", async () => {
        const { group_id } = await createGroup({ name: "Initial", slug: "initial" });
        const another = await createGroup({ name: "Other", slug: "other" });

        // Happy update.
        const ok = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: { name: "Renamed", slug: "renamed" },
        });
        expect(ok.statusCode).toBe(200);
        const updated = ok.json() as { name: string; slug: string };
        expect(updated.name).toBe("Renamed");
        expect(updated.slug).toBe("renamed");

        // Collision with another group's slug.
        const conflict = await app.inject({
            method: "PUT",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: { slug: another.slug },
        });
        expect(conflict.statusCode).toBe(409);
    });

    it("adds agent membership (idempotent) and lists members", async () => {
        const { group_id } = await createGroup({ name: "With Members" });

        const first = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}/agents/${orgAgentPid}`,
            headers: { cookie: await adminCookie() },
        });
        expect(first.statusCode).toBe(200);
        expect((first.json() as { status: string }).status).toBe("added");

        // Idempotent re-add.
        const repeat = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}/agents/${orgAgentPid}`,
            headers: { cookie: await adminCookie() },
        });
        expect(repeat.statusCode).toBe(200);
        expect((repeat.json() as { status: string }).status).toBe("already_member");

        // GET includes the member.
        const getRes = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}`,
            headers: { cookie: await adminCookie() },
        });
        const body = getRes.json() as { agents: { agent_principal_id: string }[] };
        expect(body.agents.some((a) => a.agent_principal_id === orgAgentPid)).toBe(true);

        // Remove.
        const del = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}/agents/${orgAgentPid}`,
            headers: { cookie: await adminCookie() },
        });
        expect(del.statusCode).toBe(200);
        expect((del.json() as { status: string }).status).toBe("removed");
    });

    it("rejects adding an agent from a different owner", async () => {
        const { group_id } = await createGroup({ name: "Strict" });
        const stranger = crypto.randomUUID();
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}/agents/${stranger}`,
            headers: { cookie: await adminCookie() },
        });
        expect(res.statusCode).toBe(404);
    });

    it("creates a group-scoped policy via POST /policies with applies_to_group_id", async () => {
        const { group_id } = await createGroup({ name: "Scoped" });
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policies`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: {
                applies_to_group_id: group_id,
                policy_yaml: "version: 1\ndefault: deny\nrules:\n  - id: r1\n    effect: allow\n    action: \"*\"\n",
                name: "Group-scoped",
            },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { applies_to_group_id: string; applies_to_agent_principal_id: null };
        expect(body.applies_to_group_id).toBe(group_id);
        expect(body.applies_to_agent_principal_id).toBeNull();
    });

    it("400 when both applies_to_agent_principal_id and applies_to_group_id are set", async () => {
        const { group_id } = await createGroup({ name: "Conflicted" });
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policies`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: {
                applies_to_agent_principal_id: orgAgentPid,
                applies_to_group_id: group_id,
                policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
            },
        });
        expect(res.statusCode).toBe(400);
    });

    it("DELETE refuses with 409 GROUP_HAS_POLICIES when policies are bound", async () => {
        const { group_id } = await createGroup({ name: "Guarded" });
        // Bind a policy to the group.
        await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policies`,
            headers: { cookie: await adminCookie(), "content-type": "application/json" },
            payload: {
                applies_to_group_id: group_id,
                policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
                name: "Anchor",
            },
        });

        const del = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}`,
            headers: { cookie: await adminCookie() },
        });
        expect(del.statusCode).toBe(409);
        const body = del.json() as { error: { code: string; details?: { bound_policy_ids: string[] } } };
        expect(body.error.code).toBe("GROUP_HAS_POLICIES");
        expect(body.error.details?.bound_policy_ids.length).toBe(1);
    });

    it("DELETE succeeds when no policies are bound and cleans up memberships", async () => {
        const { group_id } = await createGroup({ name: "Disposable" });
        // Add a member.
        await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}/agents/${orgAgentPid}`,
            headers: { cookie: await adminCookie() },
        });

        const del = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}`,
            headers: { cookie: await adminCookie() },
        });
        expect(del.statusCode).toBe(200);

        // Group is gone.
        const get = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${group_id}`,
            headers: { cookie: await adminCookie() },
        });
        expect(get.statusCode).toBe(404);

        // Membership is gone.
        expect(store.agentGroupMemberships.listByGroup(group_id)).toEqual([]);
    });
});
