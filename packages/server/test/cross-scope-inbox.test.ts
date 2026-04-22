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
import {
    countPendingApprovalsAcrossScopes,
    listPendingApprovalsByScope,
} from "../src/scope.js";

/**
 * Phase 8 cross-scope inbox: /gui/approvals aggregates pending across personal
 * + active org memberships. /gui/personal/approvals and /gui/orgs/:slug/approvals
 * remain per-scope filtered views. Bell badge count reflects the total.
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

function seedApproval(
    store: DataStore,
    ownerType: "user" | "org",
    ownerId: string,
    agentPid: string,
    agentId: string,
    status: "PENDING" | "APPROVED" | "DENIED" = "PENDING",
): string {
    const approvalId = crypto.randomUUID();
    const now = new Date().toISOString();
    store.approvalRequests.write({
        approval_request_id: approvalId,
        decision_id: crypto.randomUUID(),
        agent_principal_id: agentPid,
        agent_id: agentId,
        owner_type: ownerType,
        owner_id: ownerId,
        action_type: "read",
        action_hash: "",
        action: { action_type: "read", target: {} } as never,
        justification: null,
        context: null,
        status,
        approval_token: null,
        approval_token_expires_at: null,
        resolved_at: null,
        resolved_by: null,
        denial_reason: null,
        consumed_at: null,
        created_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    store.state.updateState((s) => {
        s.approval_requests = s.approval_requests ?? [];
        s.approval_requests.push({
            approval_request_id: approvalId,
            owner_type: ownerType,
            owner_id: ownerId,
            agent_principal_id: agentPid,
            status,
            path: `./approval-requests/${approvalId}.md`,
        });
    });
    return approvalId;
}

describe("cross-scope inbox (Phase 8)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let orgId: string;
    let orgSlug: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-inbox-"));
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

        const personalAgentPid = crypto.randomUUID();
        const orgAgentPid = crypto.randomUUID();
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
        store.agents.write({
            agent_principal_id: orgAgentPid,
            agent_id: "org-bot",
            owner_type: "org",
            owner_id: orgId,
            public_key_b64: "dummy",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
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
            s.agents.push(
                { agent_principal_id: personalAgentPid, agent_id: "personal-bot", owner_type: "user", owner_id: userId, path: `./agents/${personalAgentPid}.md` },
                { agent_principal_id: orgAgentPid, agent_id: "org-bot", owner_type: "org", owner_id: orgId, path: `./agents/${orgAgentPid}.md` },
            );
        });

        // 1 pending personal, 2 pending org, 1 APPROVED org (should not be counted)
        seedApproval(store, "user", userId, personalAgentPid, "personal-bot");
        seedApproval(store, "org", orgId, orgAgentPid, "org-bot");
        seedApproval(store, "org", orgId, orgAgentPid, "org-bot");
        seedApproval(store, "org", orgId, orgAgentPid, "org-bot", "APPROVED");

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("countPendingApprovalsAcrossScopes returns total across all user scopes", () => {
        const count = countPendingApprovalsAcrossScopes(store, {
            iss: "test", kid: "test", sub: userId, iat: "", exp: "", purpose: "user_session",
        });
        expect(count).toBe(3); // 1 personal + 2 org (APPROVED excluded)
    });

    it("listPendingApprovalsByScope groups pending per scope", () => {
        const groups = listPendingApprovalsByScope(store, {
            iss: "test", kid: "test", sub: userId, iat: "", exp: "", purpose: "user_session",
        });
        const personal = groups.find((g) => g.scope.type === "user");
        const org = groups.find((g) => g.scope.type === "org");
        expect(personal?.approvalRequestIds).toHaveLength(1);
        expect(org?.approvalRequestIds).toHaveLength(2);
    });

    it("/gui/approvals aggregates across scopes and renders scope pills", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/approvals",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // Both scope pills should appear — 1 Personal + 2 Acme approvals.
        expect(res.body).toContain("approvals-scope-pill");
        expect(res.body).toContain("Personal");
        expect(res.body).toContain("Acme");
    });

    it("/gui/personal/approvals shows only personal pending, no scope pills", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/approvals",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // Per-scope pages don't render scope pills.
        expect(res.body).not.toContain("approvals-scope-pill");
    });

    it("sidebar Inbox nav item shows a badge with the total count", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/dashboard",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // Inbox nav item with badge "3"
        expect(res.body).toMatch(/class="nav-badge">\s*3\s*</);
        // And it links to the cross-scope URL
        expect(res.body).toContain(`href="/gui/approvals"`);
    });
});
