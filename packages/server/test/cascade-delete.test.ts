import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
    writeUserFile,
    writeAgentFile,
    writePolicyFile,
    writeApprovalRequestFile,
    writePolicyDraftFile,
    readState,
    writeState,
    hashPassphrase,
    createFileDataStore,
    signRequest,
} from "@openleash/core";
import type { StateData } from "@openleash/core";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { bootstrapState } from "../src/bootstrap.js";
import type { FastifyInstance } from "fastify";

// ─── Helper: create a full test environment ──────────────────────────

function createTestEnv() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-cascade-"));
    const dataDir = path.join(rootDir, "data");
    bootstrapState(rootDir);
    return { rootDir, dataDir };
}

function createUser(dataDir: string, id: string, name: string, opts?: { admin?: boolean }) {
    const { hash, salt } = hashPassphrase("test-passphrase");
    writeUserFile(dataDir, {
        user_principal_id: id,
        display_name: name,
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
        passphrase_hash: hash,
        passphrase_salt: salt,
        passphrase_set_at: new Date().toISOString(),
        system_roles: opts?.admin ? ["admin"] : [],
    });
}

function createAgent(dataDir: string, agentPid: string, agentId: string, ownerType: "user" | "org", ownerId: string) {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    writeAgentFile(dataDir, {
        agent_principal_id: agentPid,
        agent_id: agentId,
        owner_type: ownerType,
        owner_id: ownerId,
        public_key_b64: pubB64,
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
        revoked_at: null,
        webhook_url: "",
        webhook_secret: "",
        webhook_auth_token: "",
    });
}

function createPolicy(dataDir: string, policyId: string, ownerType: "user" | "org", ownerId: string, appliesToAgent: string | null, name?: string) {
    writePolicyFile(dataDir, policyId, `version: 1\ndefault: deny\nrules:\n  - id: r1\n    effect: allow\n    action: "*"\n`);
    return {
        policy_id: policyId,
        owner_type: ownerType,
        owner_id: ownerId,
        applies_to_agent_principal_id: appliesToAgent,
        name: name ?? null,
        description: null,
        path: `./policies/${policyId}.yaml`,
    };
}

async function loginUser(app: FastifyInstance, userId: string): Promise<string> {
    const res = await app.inject({
        method: "POST",
        url: "/v1/owner/login",
        payload: { user_principal_id: userId, passphrase: "test-passphrase" },
    });
    return JSON.parse(res.body).token;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("Cascade delete", () => {
    describe("DELETE /v1/admin/agents/:agentPrincipalId", () => {
        let app: FastifyInstance;
        let dataDir: string;
        const adminId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        const agentPid = crypto.randomUUID();
        const policyForAgent = crypto.randomUUID();
        const policyForAll = crypto.randomUUID();

        beforeAll(async () => {
            const env = createTestEnv();
            dataDir = env.dataDir;

            createUser(dataDir, adminId, "Admin", { admin: true });
            createUser(dataDir, userId, "Owner");
            createAgent(dataDir, agentPid, "test-agent", "user", userId);

            const state = readState(dataDir);
            state.users.push(
                { user_principal_id: adminId, path: `./users/${adminId}.md` },
                { user_principal_id: userId, path: `./users/${userId}.md` },
            );
            state.agents.push({
                agent_principal_id: agentPid,
                agent_id: "test-agent",
                owner_type: "user",
                owner_id: userId,
                path: `./agents/${agentPid}.md`,
            });

            // Policy targeting this agent specifically
            state.policies.push(createPolicy(dataDir, policyForAgent, "user", userId, agentPid, "Agent-specific policy"));
            state.bindings.push({
                owner_type: "user",
                owner_id: userId,
                policy_id: policyForAgent,
                applies_to_agent_principal_id: agentPid,
            });

            // Policy for all agents (should NOT be deleted)
            state.policies.push(createPolicy(dataDir, policyForAll, "user", userId, null, "General policy"));
            state.bindings.push({
                owner_type: "user",
                owner_id: userId,
                policy_id: policyForAll,
                applies_to_agent_principal_id: null,
            });

            // Approval request referencing this agent
            state.approval_requests = [{
                approval_request_id: "ar-1",
                owner_type: "user",
                owner_id: userId,
                agent_principal_id: agentPid,
                status: "PENDING",
                path: "./approval-requests/ar-1.md",
            }];
            writeApprovalRequestFile(dataDir, {
                approval_request_id: "ar-1",
                owner_type: "user",
                owner_id: userId,
                agent_principal_id: agentPid,
                agent_id: "test-agent",
                action_type: "transfer",
                action_payload: {},
                action_hash: "abc",
                status: "PENDING",
                resolved_at: null,
                resolved_by: null,
                approval_token: null,
                created_at: new Date().toISOString(),
            });

            // Policy draft referencing this agent
            state.policy_drafts = [{
                policy_draft_id: "pd-1",
                owner_type: "user",
                owner_id: userId,
                agent_principal_id: agentPid,
                status: "PENDING",
                path: "./policy-drafts/pd-1.md",
            }];
            writePolicyDraftFile(dataDir, {
                policy_draft_id: "pd-1",
                agent_principal_id: agentPid,
                agent_id: "test-agent",
                owner_type: "user",
                owner_id: userId,
                applies_to_agent_principal_id: agentPid,
                name: "Draft policy",
                description: null,
                policy_yaml: "version: 1\ndefault: deny\nrules: []",
                justification: null,
                status: "PENDING",
                resulting_policy_id: null,
                resolved_at: null,
                resolved_by: null,
                denial_reason: null,
                created_at: new Date().toISOString(),
            });

            writeState(dataDir, state);

            const config = loadConfig(env.rootDir);
            const store = createFileDataStore(dataDir);
            const { app: server } = await createServer({ config, dataDir, store });
            app = server;
            await app.ready();
        });

        afterAll(async () => { await app.close(); });

        it("deletes agent and cascades dependent data", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/agents/${agentPid}`,
                headers: { host: "localhost" },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.status).toBe("deleted");
            expect(body.policies_removed).toBe(1); // only agent-specific policy
            expect(body.approval_requests_removed).toBe(1);
            expect(body.policy_drafts_removed).toBe(1);

            // Verify state
            const state = readState(dataDir);
            expect(state.agents.find((a) => a.agent_principal_id === agentPid)).toBeUndefined();
            expect(state.policies.find((p) => p.policy_id === policyForAgent)).toBeUndefined();
            // General policy should still exist
            expect(state.policies.find((p) => p.policy_id === policyForAll)).toBeDefined();
            // Bindings for the deleted policy should be gone
            expect(state.bindings.find((b) => b.policy_id === policyForAgent)).toBeUndefined();
            // General binding should still exist
            expect(state.bindings.find((b) => b.policy_id === policyForAll)).toBeDefined();
            // Approval request should be gone
            expect((state.approval_requests ?? []).find((ar) => ar.approval_request_id === "ar-1")).toBeUndefined();
            // Policy draft should be gone
            expect((state.policy_drafts ?? []).find((pd) => pd.policy_draft_id === "pd-1")).toBeUndefined();
        });

        it("returns 404 for non-existent agent", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/agents/${crypto.randomUUID()}`,
                headers: { host: "localhost" },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    describe("DELETE /v1/admin/organizations/:orgId", () => {
        let app: FastifyInstance;
        let dataDir: string;
        const adminId = crypto.randomUUID();
        const memberId = crypto.randomUUID();
        const orgId = crypto.randomUUID();
        const orgAgentPid = crypto.randomUUID();
        const orgPolicyId = crypto.randomUUID();

        beforeAll(async () => {
            const env = createTestEnv();
            dataDir = env.dataDir;

            createUser(dataDir, adminId, "Admin", { admin: true });
            createUser(dataDir, memberId, "Member");
            createAgent(dataDir, orgAgentPid, "org-agent", "org", orgId);

            // Write org file
            const orgDir = path.join(dataDir, "organizations");
            fs.mkdirSync(orgDir, { recursive: true });
            fs.writeFileSync(path.join(orgDir, `${orgId}.md`), `---\norg_id: ${orgId}\ndisplay_name: Test Org\nstatus: ACTIVE\ncreated_at: "${new Date().toISOString()}"\n---\nOrganization: Test Org\n`);

            // Write membership file
            const membershipId = crypto.randomUUID();
            const membDir = path.join(dataDir, "memberships");
            fs.mkdirSync(membDir, { recursive: true });
            fs.writeFileSync(path.join(membDir, `${membershipId}.json`), JSON.stringify({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: memberId,
                role: "org_member",
                status: "active",
                invited_by_user_id: adminId,
                created_at: new Date().toISOString(),
            }));

            // Write org invite
            const invDir = path.join(dataDir, "org-invites");
            fs.mkdirSync(invDir, { recursive: true });
            fs.writeFileSync(path.join(invDir, "inv-1.json"), JSON.stringify({
                invite_id: "inv-1",
                org_id: orgId,
                user_principal_id: crypto.randomUUID(),
                role: "org_member",
                status: "pending",
                invited_by_user_id: adminId,
                created_at: new Date().toISOString(),
            }));

            const state = readState(dataDir);
            state.users.push(
                { user_principal_id: adminId, path: `./users/${adminId}.md` },
                { user_principal_id: memberId, path: `./users/${memberId}.md` },
            );
            state.organizations.push({ org_id: orgId, path: `./organizations/${orgId}.md` });
            state.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: memberId,
                path: `./memberships/${membershipId}.json`,
            });
            state.agents.push({
                agent_principal_id: orgAgentPid,
                agent_id: "org-agent",
                owner_type: "org",
                owner_id: orgId,
                path: `./agents/${orgAgentPid}.md`,
            });
            state.policies.push(createPolicy(dataDir, orgPolicyId, "org", orgId, null, "Org policy"));
            state.bindings.push({
                owner_type: "org",
                owner_id: orgId,
                policy_id: orgPolicyId,
                applies_to_agent_principal_id: null,
            });
            writeState(dataDir, state);

            const config = loadConfig(env.rootDir);
            const store = createFileDataStore(dataDir);
            const { app: server } = await createServer({ config, dataDir, store });
            app = server;
            await app.ready();
        });

        afterAll(async () => { await app.close(); });

        it("deletes org and cascades all dependent data", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/organizations/${orgId}`,
                headers: { host: "localhost" },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.status).toBe("deleted");
            expect(body.agents_removed).toBe(1);
            expect(body.policies_removed).toBe(1);
            expect(body.memberships_removed).toBe(1);
            expect(body.org_invites_removed).toBe(1);

            // Verify state
            const state = readState(dataDir);
            expect(state.organizations.find((o) => o.org_id === orgId)).toBeUndefined();
            expect(state.agents.find((a) => a.agent_principal_id === orgAgentPid)).toBeUndefined();
            expect(state.policies.find((p) => p.policy_id === orgPolicyId)).toBeUndefined();
            expect(state.memberships.find((m) => m.org_id === orgId)).toBeUndefined();
            expect(state.bindings.find((b) => b.owner_type === "org" && b.owner_id === orgId)).toBeUndefined();

            // Agent file should be deleted
            expect(fs.existsSync(path.join(dataDir, "agents", `${orgAgentPid}.md`))).toBe(false);
            // Policy file should be deleted
            expect(fs.existsSync(path.join(dataDir, "policies", `${orgPolicyId}.yaml`))).toBe(false);
        });

        it("returns 404 for non-existent org", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/organizations/${crypto.randomUUID()}`,
                headers: { host: "localhost" },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    describe("DELETE /v1/admin/users/:userId", () => {
        let app: FastifyInstance;
        let dataDir: string;
        const adminId = crypto.randomUUID();
        const targetUserId = crypto.randomUUID();
        const userAgentPid = crypto.randomUUID();
        const userPolicyId = crypto.randomUUID();
        const orgId = crypto.randomUUID();

        beforeAll(async () => {
            const env = createTestEnv();
            dataDir = env.dataDir;

            createUser(dataDir, adminId, "Admin", { admin: true });
            createUser(dataDir, targetUserId, "Target User");
            createAgent(dataDir, userAgentPid, "user-agent", "user", targetUserId);

            // Write org + membership for the user
            const orgDir = path.join(dataDir, "organizations");
            fs.mkdirSync(orgDir, { recursive: true });
            fs.writeFileSync(path.join(orgDir, `${orgId}.md`), `---\norg_id: ${orgId}\ndisplay_name: Some Org\nstatus: ACTIVE\ncreated_at: "${new Date().toISOString()}"\n---\n`);

            const membershipId = crypto.randomUUID();
            const membDir = path.join(dataDir, "memberships");
            fs.mkdirSync(membDir, { recursive: true });
            fs.writeFileSync(path.join(membDir, `${membershipId}.json`), JSON.stringify({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: targetUserId,
                role: "org_member",
                status: "active",
                invited_by_user_id: null,
                created_at: new Date().toISOString(),
            }));

            const state = readState(dataDir);
            state.users.push(
                { user_principal_id: adminId, path: `./users/${adminId}.md` },
                { user_principal_id: targetUserId, path: `./users/${targetUserId}.md` },
            );
            state.organizations.push({ org_id: orgId, path: `./organizations/${orgId}.md` });
            state.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: targetUserId,
                path: `./memberships/${membershipId}.json`,
            });
            state.agents.push({
                agent_principal_id: userAgentPid,
                agent_id: "user-agent",
                owner_type: "user",
                owner_id: targetUserId,
                path: `./agents/${userAgentPid}.md`,
            });
            state.policies.push(createPolicy(dataDir, userPolicyId, "user", targetUserId, null, "User policy"));
            state.bindings.push({
                owner_type: "user",
                owner_id: targetUserId,
                policy_id: userPolicyId,
                applies_to_agent_principal_id: null,
            });
            writeState(dataDir, state);

            const config = loadConfig(env.rootDir);
            const store = createFileDataStore(dataDir);
            const { app: server } = await createServer({ config, dataDir, store });
            app = server;
            await app.ready();
        });

        afterAll(async () => { await app.close(); });

        it("deletes user and cascades all dependent data", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/users/${targetUserId}`,
                headers: { host: "localhost" },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.status).toBe("deleted");
            expect(body.agents_removed).toBe(1);
            expect(body.policies_removed).toBe(1);
            expect(body.memberships_removed).toBe(1);

            // Verify state
            const state = readState(dataDir);
            expect(state.users.find((u) => u.user_principal_id === targetUserId)).toBeUndefined();
            expect(state.agents.find((a) => a.agent_principal_id === userAgentPid)).toBeUndefined();
            expect(state.policies.find((p) => p.policy_id === userPolicyId)).toBeUndefined();
            expect(state.memberships.find((m) => m.user_principal_id === targetUserId)).toBeUndefined();
            expect(state.bindings.find((b) => b.owner_type === "user" && b.owner_id === targetUserId)).toBeUndefined();

            // Org should still exist (only membership was removed)
            expect(state.organizations.find((o) => o.org_id === orgId)).toBeDefined();

            // Files should be cleaned up
            expect(fs.existsSync(path.join(dataDir, "users", `${targetUserId}.md`))).toBe(false);
            expect(fs.existsSync(path.join(dataDir, "agents", `${userAgentPid}.md`))).toBe(false);
            expect(fs.existsSync(path.join(dataDir, "policies", `${userPolicyId}.yaml`))).toBe(false);
        });

        it("returns 404 for non-existent user", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/users/${crypto.randomUUID()}`,
                headers: { host: "localhost" },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    describe("DELETE /v1/owner/account (self-delete)", () => {
        let app: FastifyInstance;
        let dataDir: string;
        const userId = crypto.randomUUID();
        const userAgentPid = crypto.randomUUID();
        let sessionToken: string;

        beforeAll(async () => {
            const env = createTestEnv();
            dataDir = env.dataDir;

            createUser(dataDir, userId, "Self-Delete User");
            createAgent(dataDir, userAgentPid, "my-agent", "user", userId);

            const state = readState(dataDir);
            state.users.push(
                { user_principal_id: userId, path: `./users/${userId}.md` },
            );
            state.agents.push({
                agent_principal_id: userAgentPid,
                agent_id: "my-agent",
                owner_type: "user",
                owner_id: userId,
                path: `./agents/${userAgentPid}.md`,
            });
            writeState(dataDir, state);

            const config = loadConfig(env.rootDir);
            const store = createFileDataStore(dataDir);
            const { app: server } = await createServer({ config, dataDir, store });
            app = server;
            await app.ready();

            sessionToken = await loginUser(app, userId);
        });

        afterAll(async () => { await app.close(); });

        it("allows user to delete their own account", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: "/v1/owner/account",
                headers: {
                    authorization: `Bearer ${sessionToken}`,
                    "content-type": "application/json",
                },
                payload: {},
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.status).toBe("deleted");
            expect(body.agents_removed).toBe(1);

            // Verify user and agent are gone
            const state = readState(dataDir);
            expect(state.users.find((u) => u.user_principal_id === userId)).toBeUndefined();
            expect(state.agents.find((a) => a.agent_principal_id === userAgentPid)).toBeUndefined();

            // Files should be cleaned up
            expect(fs.existsSync(path.join(dataDir, "users", `${userId}.md`))).toBe(false);
            expect(fs.existsSync(path.join(dataDir, "agents", `${userAgentPid}.md`))).toBe(false);
        });
    });

    describe("Cascade preserves unrelated data", () => {
        let app: FastifyInstance;
        let dataDir: string;
        const adminId = crypto.randomUUID();
        const userAId = crypto.randomUUID();
        const userBId = crypto.randomUUID();
        const agentA = crypto.randomUUID();
        const agentB = crypto.randomUUID();
        const policyA = crypto.randomUUID();
        const policyB = crypto.randomUUID();

        beforeAll(async () => {
            const env = createTestEnv();
            dataDir = env.dataDir;

            createUser(dataDir, adminId, "Admin", { admin: true });
            createUser(dataDir, userAId, "User A");
            createUser(dataDir, userBId, "User B");
            createAgent(dataDir, agentA, "agent-a", "user", userAId);
            createAgent(dataDir, agentB, "agent-b", "user", userBId);

            const state = readState(dataDir);
            state.users.push(
                { user_principal_id: adminId, path: `./users/${adminId}.md` },
                { user_principal_id: userAId, path: `./users/${userAId}.md` },
                { user_principal_id: userBId, path: `./users/${userBId}.md` },
            );
            state.agents.push(
                { agent_principal_id: agentA, agent_id: "agent-a", owner_type: "user", owner_id: userAId, path: `./agents/${agentA}.md` },
                { agent_principal_id: agentB, agent_id: "agent-b", owner_type: "user", owner_id: userBId, path: `./agents/${agentB}.md` },
            );
            state.policies.push(
                createPolicy(dataDir, policyA, "user", userAId, null, "Policy A"),
                createPolicy(dataDir, policyB, "user", userBId, null, "Policy B"),
            );
            state.bindings.push(
                { owner_type: "user", owner_id: userAId, policy_id: policyA, applies_to_agent_principal_id: null },
                { owner_type: "user", owner_id: userBId, policy_id: policyB, applies_to_agent_principal_id: null },
            );
            writeState(dataDir, state);

            const config = loadConfig(env.rootDir);
            const store = createFileDataStore(dataDir);
            const { app: server } = await createServer({ config, dataDir, store });
            app = server;
            await app.ready();
        });

        afterAll(async () => { await app.close(); });

        it("deleting user A does not affect user B's data", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/users/${userAId}`,
                headers: { host: "localhost" },
            });
            expect(res.statusCode).toBe(200);

            const state = readState(dataDir);

            // User A's data should be gone
            expect(state.users.find((u) => u.user_principal_id === userAId)).toBeUndefined();
            expect(state.agents.find((a) => a.agent_principal_id === agentA)).toBeUndefined();
            expect(state.policies.find((p) => p.policy_id === policyA)).toBeUndefined();

            // User B's data should be intact
            expect(state.users.find((u) => u.user_principal_id === userBId)).toBeDefined();
            expect(state.agents.find((a) => a.agent_principal_id === agentB)).toBeDefined();
            expect(state.policies.find((p) => p.policy_id === policyB)).toBeDefined();
            expect(state.bindings.find((b) => b.policy_id === policyB)).toBeDefined();

            // User B's files should still exist
            expect(fs.existsSync(path.join(dataDir, "users", `${userBId}.md`))).toBe(true);
            expect(fs.existsSync(path.join(dataDir, "agents", `${agentB}.md`))).toBe(true);
            expect(fs.existsSync(path.join(dataDir, "policies", `${policyB}.yaml`))).toBe(true);
        });
    });
});
