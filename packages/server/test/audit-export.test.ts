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
 * API keys (`ola_…`) + GET …/audit/export — the incremental, cursor-based
 * audit feed for SIEMs. Sessions carry NO org_memberships claims (hosted-mode
 * shape), so membership is resolved from the store.
 */

async function sessionCookieFor(dataDir: string, userId: string): Promise<string> {
    const state = readState(dataDir);
    const key = readKeyFile(dataDir, state.server_keys.active_kid);
    const { token } = await issueSessionToken({ key, userPrincipalId: userId, ttlSeconds: 3600 });
    return `openleash_session=${token}`;
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

function moveAgent(store: DataStore, pid: string, ownerType: "user" | "org", ownerId: string): void {
    store.state.updateState((s) => {
        const a = s.agents.find((x) => x.agent_principal_id === pid)!;
        a.owner_type = ownerType;
        a.owner_id = ownerId;
    });
}

describe("API keys + audit export", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;
    let adminId: string;
    let viewerId: string;
    let outsiderId: string;
    let orgId: string;
    let otherOrgId: string;
    let orgAgent: string;
    let movedAgent: string;
    let adminCookie: string;
    let viewerCookie: string;
    let outsiderCookie: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-audit-export-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        adminId = crypto.randomUUID();
        viewerId = crypto.randomUUID();
        outsiderId = crypto.randomUUID();
        seedUser(store, adminId, "Admin");
        seedUser(store, viewerId, "Viewer");
        seedUser(store, outsiderId, "Outsider");

        orgId = crypto.randomUUID();
        otherOrgId = crypto.randomUUID();
        seedOrg(store, orgId, "acme", adminId);
        seedOrg(store, otherOrgId, "globex", outsiderId);
        seedMembership(store, orgId, adminId, "org_admin");
        seedMembership(store, orgId, viewerId, "org_viewer");
        seedMembership(store, otherOrgId, outsiderId, "org_admin");

        orgAgent = crypto.randomUUID();
        movedAgent = crypto.randomUUID();
        seedAgent(store, orgAgent, "acme-bot", "org", orgId);
        seedAgent(store, movedAgent, "nomad-bot", "user", adminId);

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();

        // Appends go through the server's wrapped audit store, which records
        // the agent's owner as of write time.
        store.audit.append("DECISION_CREATED", {
            result: "ALLOW",
            action_type: "payments.send",
            agent_id: "acme-bot",
            agent_principal_id: orgAgent,
        }, { principal_id: orgAgent });
        store.audit.append("AUTHORIZE_CALLED", { agent_principal_id: movedAgent, agent_id: "nomad-bot" });
        // nomad-bot moves from the admin's personal account into acme.
        moveAgent(store, movedAgent, "org", orgId);
        store.audit.append("AUTHORIZE_CALLED", { agent_principal_id: movedAgent, agent_id: "nomad-bot" });
        store.audit.append("ORG_UPDATED", { org_id: orgId }, { principal_id: adminId });
        // globex noise
        store.audit.append("ORG_UPDATED", { org_id: otherOrgId }, { principal_id: outsiderId });

        adminCookie = await sessionCookieFor(dataDir, adminId);
        viewerCookie = await sessionCookieFor(dataDir, viewerId);
        outsiderCookie = await sessionCookieFor(dataDir, outsiderId);
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    async function createOrgKey(name = "Splunk"): Promise<{ token: string; api_key_id: string }> {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/api-keys`,
            headers: { cookie: adminCookie },
            payload: { name },
        });
        expect(res.statusCode).toBe(200);
        return res.json();
    }

    function exportOrg(token: string, query = "") {
        return app.inject({
            method: "GET",
            url: `/v1/owner/organizations/${orgId}/audit/export${query}`,
            headers: { authorization: `Bearer ${token}` },
        });
    }

    describe("key management", () => {
        it("org admin creates a key; the token is returned once and never listed", async () => {
            const key = await createOrgKey();
            expect(key.token).toMatch(/^ola_[0-9a-f-]{36}\..+/);
            expect(key).toMatchObject({ scopes: ["audit:read"], status: "ACTIVE", created_by_user_id: adminId });

            const list = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/api-keys`,
                headers: { cookie: viewerCookie },
            });
            expect(list.statusCode).toBe(200);
            const listed = list.json().api_keys.find((k: { api_key_id: string }) => k.api_key_id === key.api_key_id);
            expect(listed).toBeDefined();
            expect(listed.token).toBeUndefined();
            expect(listed.token_hash).toBeUndefined();
        });

        it("viewers and outsiders cannot create org keys", async () => {
            for (const cookie of [viewerCookie, outsiderCookie]) {
                const res = await app.inject({
                    method: "POST",
                    url: `/v1/owner/organizations/${orgId}/api-keys`,
                    headers: { cookie },
                    payload: { name: "nope" },
                });
                expect(res.statusCode).toBe(403);
            }
        });

        it("rejects unknown scopes", async () => {
            const res = await app.inject({
                method: "POST",
                url: `/v1/owner/api-keys`,
                headers: { cookie: adminCookie },
                payload: { name: "x", scopes: ["policies:write"] },
            });
            expect(res.statusCode).toBe(400);
        });

        it("revoked keys stop working", async () => {
            const key = await createOrgKey("to-revoke");
            expect((await exportOrg(key.token)).statusCode).toBe(200);

            const del = await app.inject({
                method: "DELETE",
                url: `/v1/owner/organizations/${orgId}/api-keys/${key.api_key_id}`,
                headers: { cookie: adminCookie },
            });
            expect(del.statusCode).toBe(200);
            expect(del.json().status).toBe("REVOKED");

            const res = await exportOrg(key.token);
            expect(res.statusCode).toBe(401);
            expect(res.json().error.code).toBe("API_KEY_REVOKED");
        });

        it("a key cannot be revoked through another org", async () => {
            const key = await createOrgKey("cross-org");
            const res = await app.inject({
                method: "DELETE",
                url: `/v1/owner/organizations/${otherOrgId}/api-keys/${key.api_key_id}`,
                headers: { cookie: outsiderCookie },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    describe("export", () => {
        it("returns the org's events in OCSF, scoped by owner at write time", async () => {
            const { token } = await createOrgKey();
            const res = await exportOrg(token);
            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.format).toBe("ocsf");

            const codes = body.items.map((e: { metadata: { event_code: string } }) => e.metadata.event_code);
            // nomad-bot's AUTHORIZE_CALLED from before the transfer belongs to
            // the admin's personal log, not acme's; globex noise is excluded.
            const authorizeCalls = body.items.filter(
                (e: { metadata: { event_code: string } }) => e.metadata.event_code === "AUTHORIZE_CALLED",
            );
            expect(authorizeCalls).toHaveLength(1);
            expect(codes).toContain("DECISION_CREATED");
            expect(codes).toContain("ORG_UPDATED");
            expect(codes).toContain("API_KEY_CREATED");
            for (const e of body.items) {
                const meta = e.unmapped.metadata as Record<string, unknown>;
                expect(meta.org_id ?? meta.owner_id).toBe(orgId);
            }

            const decision = body.items.find(
                (e: { metadata: { event_code: string } }) => e.metadata.event_code === "DECISION_CREATED",
            );
            expect(decision).toMatchObject({ class_uid: 6003, action_id: 1, api: { operation: "payments.send" } });
        });

        it("the personal export keeps pre-transfer events of an agent moved away", async () => {
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/audit/export?format=native`,
                headers: { cookie: adminCookie },
            });
            expect(res.statusCode).toBe(200);
            const items = res.json().items as Array<{ event_type: string; metadata_json: Record<string, unknown> }>;
            const nomad = items.filter((e) => e.metadata_json.agent_principal_id === movedAgent);
            expect(nomad).toHaveLength(1);
            expect(nomad[0].metadata_json).toMatchObject({ owner_type: "user", owner_id: adminId });
        });

        it("pages incrementally with a stable cursor", async () => {
            const { token } = await createOrgKey();
            const all = (await exportOrg(token, "?format=native&limit=1000")).json();

            const seen: string[] = [];
            let cursor: string | null = null;
            for (let i = 0; i < 50; i++) {
                const q = `?format=native&limit=2${cursor ? `&cursor=${cursor}` : ""}`;
                const page = (await exportOrg(token, q)).json();
                seen.push(...page.items.map((e: { event_id: string }) => e.event_id));
                cursor = page.next_cursor;
                if (!page.has_more) break;
            }
            expect(seen).toEqual(all.items.map((e: { event_id: string }) => e.event_id));

            // Nothing new yet: polling from the tail returns nothing and keeps the cursor.
            const idle = (await exportOrg(token, `?cursor=${cursor}`)).json();
            expect(idle.items).toEqual([]);
            expect(idle.next_cursor).toBe(cursor);

            // A new event shows up on the next poll.
            store.audit.append("ORG_UPDATED", { org_id: orgId }, { principal_id: adminId });
            const fresh = (await exportOrg(token, `?format=native&cursor=${cursor}`)).json();
            expect(fresh.items.map((e: { event_type: string }) => e.event_type)).toEqual(["ORG_UPDATED"]);
        });

        it("serves NDJSON with the cursor in headers", async () => {
            const { token } = await createOrgKey();
            const res = await exportOrg(token, "?output=ndjson&limit=2");
            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toContain("application/x-ndjson");
            expect(res.headers["openleash-next-cursor"]).toBeTruthy();
            expect(res.headers["openleash-has-more"]).toBe("true");
            const lines = res.body.trim().split("\n");
            expect(lines).toHaveLength(2);
            expect(JSON.parse(lines[0]).class_uid).toBeTypeOf("number");
        });

        it("rejects bad cursors and unknown formats", async () => {
            const { token } = await createOrgKey();
            expect((await exportOrg(token, "?cursor=garbage")).statusCode).toBe(400);
            expect((await exportOrg(token, "?format=cef")).statusCode).toBe(400);
            const stale = Buffer.from(
                JSON.stringify({ v: 1, e: crypto.randomUUID(), t: new Date().toISOString() }),
            ).toString("base64url");
            const res = await exportOrg(token, `?cursor=${stale}`);
            expect(res.statusCode).toBe(410);
            expect(res.json().error.code).toBe("CURSOR_EXPIRED");
        });

        it("an org key cannot read another org or the personal endpoint", async () => {
            const { token } = await createOrgKey();
            const other = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${otherOrgId}/audit/export`,
                headers: { authorization: `Bearer ${token}` },
            });
            expect(other.statusCode).toBe(403);
            const personal = await app.inject({
                method: "GET",
                url: `/v1/owner/audit/export`,
                headers: { authorization: `Bearer ${token}` },
            });
            expect(personal.statusCode).toBe(403);
        });

        it("a personal key reads the personal export", async () => {
            const created = await app.inject({
                method: "POST",
                url: `/v1/owner/api-keys`,
                headers: { cookie: viewerCookie },
                payload: { name: "mine" },
            });
            expect(created.statusCode).toBe(200);
            const res = await app.inject({
                method: "GET",
                url: `/v1/owner/audit/export?format=native`,
                headers: { authorization: `Bearer ${created.json().token}` },
            });
            expect(res.statusCode).toBe(200);
            const types = res.json().items.map((e: { event_type: string }) => e.event_type);
            expect(types).toContain("API_KEY_CREATED");
        });

        it("sessions work too: members may export, outsiders may not", async () => {
            const ok = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/audit/export`,
                headers: { cookie: viewerCookie },
            });
            expect(ok.statusCode).toBe(200);
            const denied = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/audit/export`,
                headers: { cookie: outsiderCookie },
            });
            expect(denied.statusCode).toBe(403);
            const anon = await app.inject({
                method: "GET",
                url: `/v1/owner/organizations/${orgId}/audit/export`,
            });
            expect(anon.statusCode).toBe(401);
        });

        it("GUI page: admins can manage org keys, viewers can only look", async () => {
            const admin = await app.inject({
                method: "GET",
                url: `/gui/orgs/acme/api-keys`,
                headers: { cookie: adminCookie, accept: "text/html" },
            });
            expect(admin.statusCode).toBe(200);
            expect(admin.body).toContain("btn-show-create");
            expect(admin.body).toContain(`/v1/owner/organizations/${orgId}/audit/export`);

            const viewer = await app.inject({
                method: "GET",
                url: `/gui/orgs/acme/api-keys`,
                headers: { cookie: viewerCookie, accept: "text/html" },
            });
            expect(viewer.statusCode).toBe(200);
            expect(viewer.body).not.toContain("btn-show-create");
            expect(viewer.body).not.toContain("oak-revoke");

            const personal = await app.inject({
                method: "GET",
                url: `/gui/personal/api-keys`,
                headers: { cookie: viewerCookie, accept: "text/html" },
            });
            expect(personal.statusCode).toBe(200);
            expect(personal.body).toContain("/v1/owner/audit/export");
        });

        it("rejects a tampered secret", async () => {
            const { token } = await createOrgKey();
            const res = await exportOrg(token.slice(0, -2) + "xx");
            expect(res.statusCode).toBe(401);
        });
    });
});
