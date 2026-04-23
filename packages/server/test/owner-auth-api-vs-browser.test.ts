/**
 * Regression: owner-auth used to hard-code "URL starts with /gui/ → redirect
 * to the login page on auth failure." That meant a mobile client that ended
 * up hitting a /gui/* URL with a stale or missing Bearer token (e.g. an
 * app-stored base URL that included the /gui prefix) would follow the
 * resulting 302 → 302 → 200 chain and parse the hosted landing HTML as the
 * requested resource, silently rendering an empty profile card.
 *
 * The middleware now redirects only when the request really looks like a
 * browser navigation: no Bearer header AND Accept includes text/html. API
 * clients get a JSON 401, regardless of URL shape.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { bootstrapState } from "../src/bootstrap.js";
import { createFileDataStore } from "@openleash/core";
import type { DataStore } from "@openleash/core";
import type { FastifyInstance } from "fastify";

describe("owner-auth — API vs browser on /gui/*", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-ownerauth-"));
        const dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        // Seed a minimal user so the server can start, but we never
        // authenticate — every test exercises the deny() branch.
        store.users.write({
            user_principal_id: crypto.randomUUID(),
            display_name: "Seed",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("Bearer token on /gui/profile returns JSON 401 (was 302 before the fix)", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gui/profile",
            headers: {
                authorization: "Bearer definitely-not-a-valid-token",
                accept: "application/json",
            },
        });
        expect(res.statusCode).toBe(401);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        const body = res.json() as { error: { code: string } };
        expect(["MISSING_TOKEN", "INVALID_SESSION"]).toContain(body.error.code);
    });

    it("Accept: application/json on /gui/profile returns JSON 401 even with no Bearer", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gui/profile",
            headers: { accept: "application/json" },
        });
        expect(res.statusCode).toBe(401);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
    });

    it("plain browser navigation to /gui/profile still redirects to login", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gui/profile",
            headers: { accept: "text/html,application/xhtml+xml" },
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toMatch(/^\/gui\/login\?returnTo=/);
    });

    it("API /v1/owner/profile with no auth returns JSON 401 (regression guard)", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/profile",
        });
        expect(res.statusCode).toBe(401);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
    });

    it("API /v1/owner/profile with a stale Bearer returns JSON 401", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/profile",
            headers: { authorization: "Bearer stale.jwt.here" },
        });
        expect(res.statusCode).toBe(401);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
    });
});
