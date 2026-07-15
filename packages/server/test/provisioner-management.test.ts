/**
 * Provisioner agent-management endpoints. Covers:
 * - org-owned provisioner lifecycle (mint/list/revoke, org_admin RBAC)
 * - GET /v1/provisioner/agents and /v1/provisioner/groups
 * - group membership add/remove via provisioner token (idempotent add)
 * - policy bind/unbind on an existing agent (agent-tier bindings)
 * - enrollment with group_id → membership created at redemption
 * - scoping: user-owned provisioners see no groups and cannot touch org
 *   groups; a revoked provisioner token stops working
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
    const { token } = await issueSessionToken({
        key,
        userPrincipalId: userId,
        ttlSeconds: 3600,
    });
    return `openleash_session=${token}`;
}

function newAgentPubkeyB64(): string {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    return publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

describe("provisioner agent management", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    const adminUserId = crypto.randomUUID();
    const viewerUserId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    let orgAgentPid: string;

    let adminCookie: string;
    let viewerCookie: string;

    let orgProvisionerId: string;
    let orgToken: string;
    let userToken: string;

    let groupId: string;
    let policyId: string;

    function bearer(token: string) {
        return { authorization: `Bearer ${token}` };
    }

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-prov-mgmt-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        for (const [id, name] of [
            [adminUserId, "Admin"],
            [viewerUserId, "Viewer"],
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
        store.agents.write({
            agent_principal_id: orgAgentPid,
            agent_id: "acme-agent-1",
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

        const memberships = [
            { user: adminUserId, role: "org_admin" as const },
            { user: viewerUserId, role: "org_viewer" as const },
        ].map((m) => ({ ...m, membership_id: crypto.randomUUID() }));
        for (const m of memberships) {
            store.memberships.write({
                membership_id: m.membership_id,
                org_id: orgId,
                user_principal_id: m.user,
                role: m.role,
                status: "active",
                invited_by_user_id: null,
                created_at: new Date().toISOString(),
            });
        }

        store.state.updateState((s) => {
            s.users.push(
                { user_principal_id: adminUserId, path: `./users/${adminUserId}.md` },
                { user_principal_id: viewerUserId, path: `./users/${viewerUserId}.md` },
            );
            s.organizations.push({ org_id: orgId, slug: "acme", path: `./organizations/${orgId}.md` });
            s.agents.push({
                agent_principal_id: orgAgentPid,
                agent_id: "acme-agent-1",
                owner_type: "org",
                owner_id: orgId,
                path: `./agents/${orgAgentPid}.md`,
            });
            s.memberships.push(
                ...memberships.map((m) => ({
                    membership_id: m.membership_id,
                    org_id: orgId,
                    user_principal_id: m.user,
                    role: m.role,
                    path: `./memberships/${m.membership_id}.json`,
                })),
            );
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();

        adminCookie = await sessionCookieFor(dataDir, adminUserId);
        viewerCookie = await sessionCookieFor(dataDir, viewerUserId);
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    // ─── Org provisioner lifecycle ───────────────────────────────────

    it("org_admin mints an org-owned provisioner", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/provisioners`,
            headers: { cookie: adminCookie, "content-type": "application/json" },
            payload: { name: "acme-launchpad" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { provisioner_id: string; token: string };
        expect(body.token).toMatch(/^olp_/);
        orgProvisionerId = body.provisioner_id;
        orgToken = body.token;
    });

    it("org_viewer cannot mint an org provisioner", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/provisioners`,
            headers: { cookie: viewerCookie, "content-type": "application/json" },
            payload: { name: "nope" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("org provisioner list shows it without secrets; viewer can read", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/provisioners`,
            headers: { cookie: viewerCookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { provisioners: Array<Record<string, unknown>> };
        expect(body.provisioners).toHaveLength(1);
        expect(body.provisioners[0].provisioner_id).toBe(orgProvisionerId);
        expect(JSON.stringify(body)).not.toContain("token_hash");
    });

    it("GET /v1/provisioner/self reflects org ownership", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/self",
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { owner_type: string; owner_id: string };
        expect(body.owner_type).toBe("org");
        expect(body.owner_id).toBe(orgId);
    });

    // ─── Fixtures via owner API: a group and a policy ────────────────

    it("owner creates a group and a policy for the org", async () => {
        const groupRes = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie: adminCookie, "content-type": "application/json" },
            payload: { name: "HR Agents" },
        });
        expect(groupRes.statusCode).toBe(200);
        groupId = (groupRes.json() as { group_id: string }).group_id;

        const policyRes = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policies`,
            headers: { cookie: adminCookie, "content-type": "application/json" },
            payload: {
                name: "HR base policy",
                policy_yaml: "version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: read",
            },
        });
        expect(policyRes.statusCode).toBe(200);
        policyId = (policyRes.json() as { policy_id: string }).policy_id;
    });

    // ─── Provisioner reads ───────────────────────────────────────────

    it("GET /v1/provisioner/agents lists the org's agents", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/agents",
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { agents: Array<{ agent_principal_id: string; status: string | null }> };
        expect(body.agents.some((a) => a.agent_principal_id === orgAgentPid && a.status === "ACTIVE")).toBe(true);
    });

    it("GET /v1/provisioner/groups lists the org's groups with member counts", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/groups",
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { groups: Array<{ group_id: string; name: string; member_count: number }> };
        expect(body.groups).toHaveLength(1);
        expect(body.groups[0].group_id).toBe(groupId);
        expect(body.groups[0].member_count).toBe(0);
    });

    // ─── Group membership via provisioner ────────────────────────────

    it("adds an agent to a group (idempotent)", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/provisioner/groups/${groupId}/agents/${orgAgentPid}`,
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { status: string }).status).toBe("added");

        const again = await app.inject({
            method: "POST",
            url: `/v1/provisioner/groups/${groupId}/agents/${orgAgentPid}`,
            headers: bearer(orgToken),
        });
        expect((again.json() as { status: string }).status).toBe("already_member");

        const memberships = store.agentGroupMemberships.listByGroup(groupId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].added_by_user_id).toBe(orgProvisionerId);
    });

    it("GET agent policies shows the group membership", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies`,
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { policies: unknown[]; groups: Array<{ group_id: string; name: string }> };
        expect(body.policies).toHaveLength(0);
        expect(body.groups).toHaveLength(1);
        expect(body.groups[0].group_id).toBe(groupId);
        expect(body.groups[0].name).toBe("HR Agents");
    });

    it("removes the agent from the group; second remove 404s", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: `/v1/provisioner/groups/${groupId}/agents/${orgAgentPid}`,
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { status: string }).status).toBe("removed");

        const again = await app.inject({
            method: "DELETE",
            url: `/v1/provisioner/groups/${groupId}/agents/${orgAgentPid}`,
            headers: bearer(orgToken),
        });
        expect(again.statusCode).toBe(404);
        expect(store.agentGroupMemberships.listByGroup(groupId)).toHaveLength(0);
    });

    // ─── Policy bind/unbind on an existing agent ─────────────────────

    it("binds an existing policy to an agent (idempotent)", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies`,
            headers: { ...bearer(orgToken), "content-type": "application/json" },
            payload: { policy_id: policyId },
        });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { status: string }).status).toBe("bound");

        const again = await app.inject({
            method: "POST",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies`,
            headers: { ...bearer(orgToken), "content-type": "application/json" },
            payload: { policy_id: policyId },
        });
        expect((again.json() as { status: string }).status).toBe("already_bound");

        const bindings = store.state
            .getState()
            .bindings.filter(
                (b) => b.policy_id === policyId && b.applies_to_agent_principal_id === orgAgentPid,
            );
        expect(bindings).toHaveLength(1);

        const list = await app.inject({
            method: "GET",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies`,
            headers: bearer(orgToken),
        });
        const body = list.json() as { policies: Array<{ policy_id: string; name: string | null }> };
        expect(body.policies).toHaveLength(1);
        expect(body.policies[0].policy_id).toBe(policyId);
        expect(body.policies[0].name).toBe("HR base policy");
    });

    it("rejects binding a policy of a different owner", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies`,
            headers: { ...bearer(orgToken), "content-type": "application/json" },
            payload: { policy_id: crypto.randomUUID() },
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe("INVALID_POLICY");
    });

    it("unbinds the policy; second unbind 404s", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies/${policyId}`,
            headers: bearer(orgToken),
        });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { status: string }).status).toBe("unbound");

        const again = await app.inject({
            method: "DELETE",
            url: `/v1/provisioner/agents/${orgAgentPid}/policies/${policyId}`,
            headers: bearer(orgToken),
        });
        expect(again.statusCode).toBe(404);

        const bindings = store.state
            .getState()
            .bindings.filter(
                (b) => b.policy_id === policyId && b.applies_to_agent_principal_id === orgAgentPid,
            );
        expect(bindings).toHaveLength(0);
    });

    // ─── Enrollment with group_id ────────────────────────────────────

    it("enrollment with group_id adds the new agent to the group at redemption", async () => {
        const enrollRes = await app.inject({
            method: "POST",
            url: "/v1/provisioner/enrollments",
            headers: { ...bearer(orgToken), "content-type": "application/json" },
            payload: { agent_name: "hr-bot", group_id: groupId, policy_id: policyId },
        });
        expect(enrollRes.statusCode).toBe(200);
        const enrollment = enrollRes.json() as {
            invite_id: string;
            invite_token: string;
            group_id: string;
            policy_id: string;
        };
        expect(enrollment.group_id).toBe(groupId);
        expect(enrollment.policy_id).toBe(policyId);

        const redeemRes = await app.inject({
            method: "POST",
            url: "/v1/agents/register-with-invite",
            headers: { "content-type": "application/json" },
            payload: {
                invite_id: enrollment.invite_id,
                invite_token: enrollment.invite_token,
                agent_id: "hr-bot",
                agent_pubkey_b64: newAgentPubkeyB64(),
                webhook_url: `http://hr-bot.invalid/webhook/${crypto.randomUUID()}`,
                webhook_secret: "test-secret",
                webhook_auth_token: "test-auth-token",
            },
        });
        expect(redeemRes.statusCode).toBe(200);
        const agent = redeemRes.json() as { agent_principal_id: string };

        const memberships = store.agentGroupMemberships.listByAgent(agent.agent_principal_id);
        expect(memberships).toHaveLength(1);
        expect(memberships[0].group_id).toBe(groupId);

        // Enrollment listing reflects the group binding.
        const listRes = await app.inject({
            method: "GET",
            url: "/v1/provisioner/enrollments",
            headers: bearer(orgToken),
        });
        const list = listRes.json() as { enrollments: Array<{ group_id: string | null; status: string }> };
        expect(list.enrollments[0].group_id).toBe(groupId);
        expect(list.enrollments[0].status).toBe("used");
    });

    it("rejects enrollment with a group of a different owner", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/v1/provisioner/enrollments",
            headers: { ...bearer(orgToken), "content-type": "application/json" },
            payload: { agent_name: "x", group_id: crypto.randomUUID() },
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe("INVALID_GROUP");
    });

    // ─── User-owned provisioner scoping ──────────────────────────────

    it("user-owned provisioner sees no groups and cannot touch org groups", async () => {
        const mintRes = await app.inject({
            method: "POST",
            url: "/v1/owner/provisioners",
            headers: { cookie: adminCookie, "content-type": "application/json" },
            payload: { name: "personal-launchpad" },
        });
        expect(mintRes.statusCode).toBe(200);
        userToken = (mintRes.json() as { token: string }).token;

        const groupsRes = await app.inject({
            method: "GET",
            url: "/v1/provisioner/groups",
            headers: bearer(userToken),
        });
        expect(groupsRes.statusCode).toBe(200);
        expect((groupsRes.json() as { groups: unknown[] }).groups).toHaveLength(0);

        // Org group is invisible to a user-owned provisioner.
        const addRes = await app.inject({
            method: "POST",
            url: `/v1/provisioner/groups/${groupId}/agents/${orgAgentPid}`,
            headers: bearer(userToken),
        });
        expect(addRes.statusCode).toBe(404);

        // As is the org agent.
        const agentsRes = await app.inject({
            method: "GET",
            url: "/v1/provisioner/agents",
            headers: bearer(userToken),
        });
        expect((agentsRes.json() as { agents: unknown[] }).agents).toHaveLength(0);
    });

    // ─── Revocation ──────────────────────────────────────────────────

    it("revoking the org provisioner invalidates its token", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/provisioners/${orgProvisionerId}`,
            headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { status: string }).status).toBe("REVOKED");

        const after = await app.inject({
            method: "GET",
            url: "/v1/provisioner/self",
            headers: bearer(orgToken),
        });
        expect(after.statusCode).toBe(401);
    });
});
