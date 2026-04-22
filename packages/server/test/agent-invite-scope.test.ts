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

/**
 * Phase 7A removed the inline owner-dropdown from the agents page. The
 * scope-implied ownerType/ownerId is now embedded in __PAGE_DATA__ and the
 * client posts to the scope-appropriate invite endpoint directly.
 *
 * These tests exercise the two invite endpoints that the simplified client
 * uses (personal and org) and check that the agents page renders the right
 * __PAGE_DATA__ for each scope.
 */

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

describe("agent-invite scope wiring (Phase 7A)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let orgId: string;
    let orgSlug: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-agent-invite-"));
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
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("personal scope: agents page embeds ownerType:user in __PAGE_DATA__", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/agents",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('"ownerType":"user"');
        expect(res.body).toContain(`"ownerId":"${userId}"`);
        // The dropdown markup is gone.
        expect(res.body).not.toContain('id="agent-owner"');
        expect(res.body).not.toContain('id="invite-owner-select"');
    });

    it("org scope: agents page embeds ownerType:org in __PAGE_DATA__", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/agents`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('"ownerType":"org"');
        expect(res.body).toContain(`"ownerId":"${orgId}"`);
        expect(res.body).toContain("Organization Agents");
    });

    it("POST /v1/owner/agent-invites creates an invite for the session user", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/agent-invites",
            headers: { cookie, "content-type": "application/json" },
            payload: {},
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { invite_id?: string; invite_token?: string };
        expect(body.invite_id).toBeTruthy();
        expect(body.invite_token).toBeTruthy();
    });

    it("POST /v1/owner/organizations/:orgId/agent-invites creates an org invite", async () => {
        const cookie = await sessionCookieFor(dataDir, userId, {
            org_memberships: [{ org_id: orgId, role: "org_admin" }],
        });
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/agent-invites`,
            headers: { cookie, "content-type": "application/json" },
            payload: {},
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { invite_id?: string; invite_token?: string };
        expect(body.invite_id).toBeTruthy();
        expect(body.invite_token).toBeTruthy();
    });
});
