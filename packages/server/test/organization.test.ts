import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
    writeUserFile,
    writeAgentFile,
    writePolicyFile,
    readState,
    writeState,
    hashPassphrase,
    writeSetupInviteFile,
    createFileDataStore,
    signRequest,
} from "@openleash/core";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { bootstrapState } from "../src/bootstrap.js";
import type { FastifyInstance } from "fastify";

describe("Organization management", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;

    // Users
    const userAId = crypto.randomUUID();
    const userBId = crypto.randomUUID();
    const userCId = crypto.randomUUID();
    let sessionTokenA: string;
    let sessionTokenB: string;
    let sessionTokenC: string;

    // Org
    let orgId: string;
    let orgBId: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-test-org-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        const store = createFileDataStore(dataDir);

        // Create three users with passphrases
        for (const [id, name] of [
            [userAId, "User A"],
            [userBId, "User B"],
            [userCId, "User C"],
        ] as const) {
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
                system_roles: id === userAId ? ["admin"] : [],
            });
        }

        const state = readState(dataDir);
        state.users.push(
            { user_principal_id: userAId, path: `./users/${userAId}.md` },
            { user_principal_id: userBId, path: `./users/${userBId}.md` },
            { user_principal_id: userCId, path: `./users/${userCId}.md` },
        );
        writeState(dataDir, state);

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();

        // Login all three users
        for (const [id, tokenRef] of [
            [userAId, "A"],
            [userBId, "B"],
            [userCId, "C"],
        ] as const) {
            const res = await app.inject({
                method: "POST",
                url: "/v1/owner/login",
                payload: { user_principal_id: id, passphrase: "test-passphrase" },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            if (tokenRef === "A") sessionTokenA = body.token;
            else if (tokenRef === "B") sessionTokenB = body.token;
            else sessionTokenC = body.token;
        }
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    // ─── Session refresh ─────────────────────────────────────────────

    describe("Session refresh", () => {
        it("refreshes token with current memberships", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/v1/owner/session/refresh",
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.token).toMatch(/^v4\.public\./);
            expect(body.user_principal_id).toBe(userAId);
            expect(body.system_roles).toContain("admin");
            // Update token for subsequent tests
            sessionTokenA = body.token;
        });
    });

    // ─── Self-service org creation ───────────────────────────────────

    describe("Self-service org creation", () => {
        it("user creates org and becomes admin", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/v1/owner/organizations",
                headers: { authorization: `Bearer ${sessionTokenC}` },
                payload: { display_name: "User C Corp" },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.org_id).toBeDefined();
            expect(body.your_role).toBe("org_admin");
            expect(body.display_name).toBe("User C Corp");

            // Verify user C can access it
            const detailRes = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${body.org_id}`,
                headers: { authorization: `Bearer ${sessionTokenC}` },
            });
            expect(detailRes.statusCode).toBe(200);
            expect(JSON.parse(detailRes.payload).your_role).toBe("org_admin");
        });

        it("rejects missing display_name", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/v1/owner/organizations",
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: {},
            });
            expect(res.statusCode).toBe(400);
        });
    });

    // ─── Admin org CRUD ──────────────────────────────────────────────

    describe("Admin org CRUD", () => {
        it("creates an organization via admin API", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/v1/admin/organizations",
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: {
                    display_name: "Acme Corp",
                    created_by_user_id: userAId,
                },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.org_id).toBeDefined();
            expect(body.display_name).toBe("Acme Corp");
            orgId = body.org_id;
        });

        it("reads org detail with members", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/admin/organizations/${orgId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.org_id).toBe(orgId);
            expect(body.members).toBeInstanceOf(Array);
            expect(body.members.length).toBe(1); // creator is auto org_admin
            expect(body.members[0].user_principal_id).toBe(userAId);
            expect(body.members[0].role).toBe("org_admin");
        });

        it("updates org via admin API", async () => {
            const res = await app.inject({
                method: "PUT",
                url: `/v1/admin/organizations/${orgId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { display_name: "Acme Corporation" },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.status).toBe("updated");
        });

        it("adds member via admin API", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/admin/organizations/${orgId}/members`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { user_principal_id: userBId, role: "org_viewer" },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.role).toBe("org_viewer");
        });

        it("lists members via admin API", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/admin/organizations/${orgId}/members`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.members.length).toBe(2);
        });

        it("updates member role via admin API", async () => {
            const res = await app.inject({
                method: "PUT",
                url: `/v1/admin/organizations/${orgId}/members/${userBId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { role: "org_member" },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.role).toBe("org_member");
        });

        it("prevents duplicate membership", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/admin/organizations/${orgId}/members`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { user_principal_id: userBId, role: "org_admin" },
            });
            expect(res.statusCode).toBe(409);
        });

        it("returns 404 for non-existent org", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/admin/organizations/${crypto.randomUUID()}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    // ─── Owner org listing ──────────────────────────────────────────

    describe("Owner org listing", () => {
        it("user A sees their org", async () => {
            // Re-login to get fresh token with memberships
            const loginRes = await app.inject({
                method: "POST",
                url: "/v1/owner/login",
                payload: { user_principal_id: userAId, passphrase: "test-passphrase" },
            });
            sessionTokenA = JSON.parse(loginRes.payload).token;

            const res = await app.inject({
                method: "GET",
                url: "/v1/owner/organizations",
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.organizations.length).toBeGreaterThanOrEqual(1);
            const org = body.organizations.find((o: { org_id: string }) => o.org_id === orgId);
            expect(org).toBeDefined();
            expect(org.role).toBe("org_admin");
        });

        it("user B sees the org they were added to", async () => {
            const loginRes = await app.inject({
                method: "POST",
                url: "/v1/owner/login",
                payload: { user_principal_id: userBId, passphrase: "test-passphrase" },
            });
            sessionTokenB = JSON.parse(loginRes.payload).token;

            const res = await app.inject({
                method: "GET",
                url: "/v1/owner/organizations",
                headers: { authorization: `Bearer ${sessionTokenB}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.organizations.find((o: { org_id: string }) => o.org_id === orgId)).toBeDefined();
        });

        it("user C sees only their self-created org", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/v1/owner/organizations",
                headers: { authorization: `Bearer ${sessionTokenC}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            // C created "User C Corp" in self-service test, not a member of the admin-created org
            const orgNames = body.organizations.map((o: { display_name?: string }) => o.display_name);
            expect(orgNames).not.toContain("Acme Corporation");
        });

        it("reads org detail", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.org_id).toBe(orgId);
            expect(body.member_count).toBe(2);
            expect(body.your_role).toBe("org_admin");
        });
    });

    // ─── Role enforcement ─────────────────────────────────────────────

    describe("Role enforcement", () => {
        it("viewer cannot update org", async () => {
            // Demote B to viewer via admin
            await app.inject({
                method: "PUT",
                url: `/v1/admin/organizations/${orgId}/members/${userBId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { role: "org_viewer" },
            });

            const res = await app.inject({
                method: "PUT",
                url: `/v1/owner/organizations/${orgId}`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
                payload: { display_name: "Hacked" },
            });
            expect(res.statusCode).toBe(403);
        });

        it("viewer cannot add members", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgId}/members`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
                payload: { user_principal_id: userCId, role: "org_viewer" },
            });
            expect(res.statusCode).toBe(403);
        });

        it("viewer can list members", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/members`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
            });
            expect(res.statusCode).toBe(200);
        });

        it("viewer can list agents", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/agents`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
            });
            expect(res.statusCode).toBe(200);
        });

        it("non-member gets 403", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}`,
                headers: { authorization: `Bearer ${sessionTokenC}` },
            });
            expect(res.statusCode).toBe(403);
        });
    });

    // ─── Member management via owner API ──────────────────────────────

    describe("Member management via owner API", () => {
        it("admin adds member C", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgId}/members`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { user_principal_id: userCId, role: "org_member" },
            });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.payload).role).toBe("org_member");
        });

        it("admin updates member C role", async () => {
            const res = await app.inject({
                method: "PUT",
                url: `/v1/owner/organizations/${orgId}/members/${userCId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { role: "org_admin" },
            });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.payload).role).toBe("org_admin");
        });

        it("cannot demote last admin", async () => {
            // Remove C's admin first so A is the only admin
            await app.inject({
                method: "PUT",
                url: `/v1/owner/organizations/${orgId}/members/${userCId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { role: "org_viewer" },
            });
            // B is viewer, C is now viewer, only A is admin
            const res = await app.inject({
                method: "PUT",
                url: `/v1/owner/organizations/${orgId}/members/${userAId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { role: "org_viewer" },
            });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.payload).error.code).toBe("LAST_ADMIN");
        });

        it("cannot remove last admin", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/owner/organizations/${orgId}/members/${userAId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.payload).error.code).toBe("LAST_ADMIN");
        });

        it("admin removes member C", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/owner/organizations/${orgId}/members/${userCId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.payload).status).toBe("removed");
        });
    });

    // ─── Org-scoped policies ──────────────────────────────────────────

    describe("Org-scoped policies", () => {
        let policyId: string;

        it("admin creates org policy", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgId}/policies`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: {
                    policy_yaml: "version: 1\ndefault: deny\nrules:\n  - id: allow_all\n    effect: allow\n    action: \"*\"\n",
                    name: "Allow all",
                },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.policy_id).toBeDefined();
            expect(body.org_id).toBe(orgId);
            policyId = body.policy_id;
        });

        it("lists org policies", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/policies`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.policies.length).toBe(1);
            expect(body.policies[0].policy_id).toBe(policyId);
        });

        it("viewer can list org policies", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/policies`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
            });
            expect(res.statusCode).toBe(200);
        });

        it("viewer cannot create org policy", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgId}/policies`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
                payload: {
                    policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
                },
            });
            expect(res.statusCode).toBe(403);
        });

        it("updates org policy", async () => {
            const res = await app.inject({
                method: "PUT",
                url: `/v1/owner/organizations/${orgId}/policies/${policyId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: { name: "Updated policy" },
            });
            expect(res.statusCode).toBe(200);
        });

        it("deletes org policy", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/owner/organizations/${orgId}/policies/${policyId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.payload).status).toBe("deleted");
        });
    });

    // ─── Org agent invites ───────────────────────────────────────────

    describe("Org agent invites", () => {
        it("admin creates org agent invite", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgId}/agent-invites`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.invite_id).toBeDefined();
            expect(body.invite_token).toBeDefined();
        });

        it("viewer cannot create agent invite", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgId}/agent-invites`,
                headers: { authorization: `Bearer ${sessionTokenB}` },
            });
            expect(res.statusCode).toBe(403);
        });
    });

    // ─── Cross-org isolation ──────────────────────────────────────────

    describe("Cross-org isolation", () => {
        beforeAll(async () => {
            // Create a second org owned by user C
            const loginRes = await app.inject({
                method: "POST",
                url: "/v1/owner/login",
                payload: { user_principal_id: userCId, passphrase: "test-passphrase" },
            });
            sessionTokenC = JSON.parse(loginRes.payload).token;

            const res = await app.inject({
                method: "POST",
                url: "/v1/admin/organizations",
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: {
                    display_name: "Other Corp",
                    created_by_user_id: userCId,
                },
            });
            orgBId = JSON.parse(res.payload).org_id;
        });

        it("user A cannot access org B", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgBId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it("user C cannot access org A", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}`,
                headers: { authorization: `Bearer ${sessionTokenC}` },
            });
            expect(res.statusCode).toBe(403);
        });

        it("user A cannot create policy on org B", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/organizations/${orgBId}/policies`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
                payload: {
                    policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
                },
            });
            expect(res.statusCode).toBe(403);
        });
    });

    // ─── Admin org deletion ──────────────────────────────────────────

    describe("Admin org deletion", () => {
        it("deletes org and cascades memberships", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/admin/organizations/${orgBId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.status).toBe("deleted");

            // Verify org is gone
            const getRes = await app.inject({
                method: "GET",
                url: `/v1/admin/organizations/${orgBId}`,
                headers: { authorization: `Bearer ${sessionTokenA}` },
            });
            expect(getRes.statusCode).toBe(404);
        });
    });
});
