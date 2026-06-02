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
 * GET /v1/owner/approvals — cross-scope approval list for mobile/API clients.
 * Aggregates approvals across personal + every active org membership. Each
 * entry carries a `scope` object. Effective EXPIRED translation for past-expiry
 * PENDING matches the single-item GET behavior.
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
    opts: {
        status?: "PENDING" | "APPROVED" | "DENIED";
        expiresAt?: string;
    } = {},
): string {
    const status = opts.status ?? "PENDING";
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
        expires_at: opts.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

describe("GET /v1/owner/approvals (cross-scope)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let otherUserId: string;
    let orgId: string;
    let orgSlug: string;
    let otherOrgId: string;
    let store: DataStore;

    let personalPendingId: string;
    let orgPendingId: string;
    let orgApprovedId: string;
    let expiredPendingId: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-xscope-approvals-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        userId = crypto.randomUUID();
        otherUserId = crypto.randomUUID();
        store.users.write({
            user_principal_id: userId,
            display_name: "Alice",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        store.users.write({
            user_principal_id: otherUserId,
            display_name: "Bob",
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

        // Org Alice is NOT a member of — its approvals should never appear.
        otherOrgId = crypto.randomUUID();
        store.organizations.write({
            org_id: otherOrgId,
            slug: "globex",
            display_name: "Globex",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: otherUserId,
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
        const otherOrgAgentPid = crypto.randomUUID();
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
        store.agents.write({
            agent_principal_id: otherOrgAgentPid,
            agent_id: "globex-bot",
            owner_type: "org",
            owner_id: otherOrgId,
            public_key_b64: "dummy",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
        });

        store.state.updateState((s) => {
            s.users.push(
                { user_principal_id: userId, path: `./users/${userId}.md` },
                { user_principal_id: otherUserId, path: `./users/${otherUserId}.md` },
            );
            s.organizations.push(
                { org_id: orgId, slug: orgSlug, path: `./organizations/${orgId}.md` },
                { org_id: otherOrgId, slug: "globex", path: `./organizations/${otherOrgId}.md` },
            );
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
                { agent_principal_id: otherOrgAgentPid, agent_id: "globex-bot", owner_type: "org", owner_id: otherOrgId, path: `./agents/${otherOrgAgentPid}.md` },
            );
        });

        personalPendingId = seedApproval(store, "user", userId, personalAgentPid, "personal-bot");
        orgPendingId = seedApproval(store, "org", orgId, orgAgentPid, "org-bot");
        orgApprovedId = seedApproval(store, "org", orgId, orgAgentPid, "org-bot", { status: "APPROVED" });
        // PENDING in state + on-disk, but past expiry — must surface as effective EXPIRED.
        expiredPendingId = seedApproval(store, "user", userId, personalAgentPid, "personal-bot", {
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
        });
        // Approval for an org Alice isn't a member of — must NOT appear in her response.
        seedApproval(store, "org", otherOrgId, otherOrgAgentPid, "globex-bot");

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("aggregates approvals across personal + member orgs (no filter)", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { approval_requests: Array<{ approval_request_id: string }> };
        const ids = new Set(body.approval_requests.map((a) => a.approval_request_id));
        expect(ids.has(personalPendingId)).toBe(true);
        expect(ids.has(orgPendingId)).toBe(true);
        expect(ids.has(orgApprovedId)).toBe(true);
        expect(ids.has(expiredPendingId)).toBe(true);
        // 4 entries total — never leaks the non-member org's approval.
        expect(body.approval_requests).toHaveLength(4);
    });

    it("?status=PENDING excludes resolved and effective-expired entries", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?status=PENDING",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { approval_requests: Array<{ approval_request_id: string; status: string }> };
        const ids = new Set(body.approval_requests.map((a) => a.approval_request_id));
        expect(ids.has(personalPendingId)).toBe(true);
        expect(ids.has(orgPendingId)).toBe(true);
        expect(ids.has(orgApprovedId)).toBe(false);
        expect(ids.has(expiredPendingId)).toBe(false);
        // All returned entries are actually PENDING.
        for (const a of body.approval_requests) expect(a.status).toBe("PENDING");
    });

    it("?status=EXPIRED returns past-expiry PENDING with effective status", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?status=EXPIRED",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { approval_requests: Array<{ approval_request_id: string; status: string }> };
        expect(body.approval_requests).toHaveLength(1);
        expect(body.approval_requests[0].approval_request_id).toBe(expiredPendingId);
        expect(body.approval_requests[0].status).toBe("EXPIRED");
    });

    it("each entry carries scope info with owner_type, owner_id, display_name, and slug", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?status=PENDING",
            headers: { cookie },
        });
        const body = res.json() as {
            approval_requests: Array<{
                approval_request_id: string;
                scope: { owner_type: string; owner_id: string; display_name: string; slug: string | null };
            }>;
        };
        const personal = body.approval_requests.find((a) => a.approval_request_id === personalPendingId)!;
        const org = body.approval_requests.find((a) => a.approval_request_id === orgPendingId)!;
        expect(personal.scope).toEqual({
            owner_type: "user",
            owner_id: userId,
            display_name: "Alice",
            slug: null,
        });
        expect(org.scope).toEqual({
            owner_type: "org",
            owner_id: orgId,
            display_name: "Acme",
            slug: orgSlug,
        });
    });

    it("returns total/limit/offset and pages with ?limit & ?offset", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);

        // No limit → full list, limit reported as null, total = 4.
        const all = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals",
            headers: { cookie },
        });
        const allBody = all.json() as {
            approval_requests: Array<{ approval_request_id: string }>;
            total: number; limit: number | null; offset: number;
        };
        expect(allBody.total).toBe(4);
        expect(allBody.limit).toBeNull();
        expect(allBody.offset).toBe(0);
        expect(allBody.approval_requests).toHaveLength(4);

        // First page of 2.
        const p1 = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?limit=2&offset=0",
            headers: { cookie },
        });
        const p1Body = p1.json() as {
            approval_requests: Array<{ approval_request_id: string }>;
            total: number; limit: number; offset: number;
        };
        expect(p1Body.total).toBe(4);
        expect(p1Body.limit).toBe(2);
        expect(p1Body.offset).toBe(0);
        expect(p1Body.approval_requests).toHaveLength(2);

        // Second page of 2 — disjoint from the first, together covering all 4.
        const p2 = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?limit=2&offset=2",
            headers: { cookie },
        });
        const p2Body = p2.json() as {
            approval_requests: Array<{ approval_request_id: string }>;
            total: number;
        };
        expect(p2Body.approval_requests).toHaveLength(2);
        const combined = new Set([
            ...p1Body.approval_requests.map((a) => a.approval_request_id),
            ...p2Body.approval_requests.map((a) => a.approval_request_id),
        ]);
        expect(combined.size).toBe(4);

        // Offset past the end → empty page, total still reported.
        const past = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?limit=2&offset=10",
            headers: { cookie },
        });
        const pastBody = past.json() as { approval_requests: unknown[]; total: number };
        expect(pastBody.approval_requests).toHaveLength(0);
        expect(pastBody.total).toBe(4);

        // limit is clamped to a max of 100.
        const clamped = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?limit=9999",
            headers: { cookie },
        });
        expect((clamped.json() as { limit: number }).limit).toBe(100);
    });

    it("combines ?status with pagination over the filtered set", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals?status=PENDING&limit=1&offset=0",
            headers: { cookie },
        });
        const body = res.json() as {
            approval_requests: Array<{ status: string }>;
            total: number; limit: number;
        };
        // 2 effective-PENDING entries (personal + org); paged 1 at a time.
        expect(body.total).toBe(2);
        expect(body.approval_requests).toHaveLength(1);
        expect(body.approval_requests[0].status).toBe("PENDING");
    });

    it("requires owner auth", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/approvals",
        });
        expect(res.statusCode).toBe(401);
    });
});
