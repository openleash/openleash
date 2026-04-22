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
 * Phase 9: the create-org form now submits an explicit slug (previously
 * auto-derived on the server). These tests cover the happy path, collision,
 * reserved words, and malformed slugs through POST /v1/owner/organizations.
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

describe("POST /v1/owner/organizations with explicit slug", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-create-org-"));
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

        store.state.updateState((s) => {
            s.users.push({ user_principal_id: userId, path: `./users/${userId}.md` });
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("uses the explicit slug when provided", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/organizations",
            headers: { cookie, "content-type": "application/json" },
            payload: { display_name: "Acme Corp", slug: "acme" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { slug?: string; org_id?: string };
        expect(body.slug).toBe("acme");
        // State index reflects the slug so readBySlug works immediately.
        expect(store.organizations.readBySlug("acme")?.org_id).toBe(body.org_id);
    });

    it("rejects a slug already taken by another org with 409", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        // First org uses 'acme' (seeded above in the earlier test).
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/organizations",
            headers: { cookie, "content-type": "application/json" },
            payload: { display_name: "Another Acme", slug: "acme" },
        });
        expect(res.statusCode).toBe(409);
        const body = res.json() as { error?: { code?: string } };
        expect(body.error?.code).toBe("SLUG_TAKEN");
    });

    it("rejects a reserved slug with 400", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/organizations",
            headers: { cookie, "content-type": "application/json" },
            payload: { display_name: "Personal Club", slug: "personal" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("rejects a malformed slug with 400", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/organizations",
            headers: { cookie, "content-type": "application/json" },
            payload: { display_name: "Broken", slug: "Bad Slug!" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("still works without explicit slug (auto-derives) — backward compat", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/organizations",
            headers: { cookie, "content-type": "application/json" },
            payload: { display_name: "Auto Derived Co" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { slug?: string };
        expect(body.slug).toBe("auto-derived-co");
    });
});
