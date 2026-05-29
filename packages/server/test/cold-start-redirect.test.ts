/**
 * Regression: a global onRequest hook in gui.ts checked
 * `fs.existsSync(statePath)` to decide whether the server needed
 * re-bootstrapping. In hosted mode the store is Firestore and `state.md`
 * never exists on local disk, so on every Cloud Run cold start the very
 * first request — including legitimate `/v1/...` API calls — was bounced
 * to `/gui`, which redirected on to the hosted landing HTML. Mobile
 * clients then logged a 200 with a `text/html` body and tried to parse
 * the login page as their requested resource.
 *
 * The fix: skip the hook entirely in hosted mode, and even self-hosted
 * never bounce non-GUI paths.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { bootstrapState } from "../src/bootstrap.js";
import { createFileDataStore } from "@openleash/core";
import type { OpenleashConfig, DataStore } from "@openleash/core";
import type { FastifyInstance } from "fastify";

async function startServer(mode: "hosted" | "self_hosted"): Promise<{
    app: FastifyInstance;
    rootDir: string;
    dataDir: string;
    statePath: string;
    store: DataStore;
}> {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-coldstart-"));
    const dataDir = path.join(rootDir, "data");
    bootstrapState(rootDir);
    const config: OpenleashConfig = {
        ...loadConfig(rootDir),
        instance: { mode },
    };
    const store = createFileDataStore(dataDir);
    store.users.write({
        user_principal_id: crypto.randomUUID(),
        display_name: "Seed",
        status: "ACTIVE",
        attributes: {},
        created_at: new Date().toISOString(),
    });
    const { app } = await createServer({ config, dataDir, store });
    await app.ready();
    return { app, rootDir, dataDir, statePath: path.join(dataDir, "state.md"), store };
}

describe("cold-start redirect bug", () => {
    let env: Awaited<ReturnType<typeof startServer>> | undefined;

    afterEach(async () => {
        if (env) {
            await env.app.close();
            fs.rmSync(env.rootDir, { recursive: true, force: true });
            env = undefined;
        }
    });

    describe("hosted mode (Firestore — state.md never on disk)", () => {
        beforeEach(async () => {
            env = await startServer("hosted");
            // Simulate the hosted reality: no local state.md file.
            if (fs.existsSync(env.statePath)) fs.unlinkSync(env.statePath);
        });

        it("does not redirect /v1/owner/audit on cold start", async () => {
            const res = await env!.app.inject({
                method: "GET",
                url: "/v1/owner/audit?limit=50",
            });
            // The bug: 302 → /gui → / → 200 HTML landing.
            // The fix: auth middleware runs normally, returns JSON 401.
            expect(res.statusCode).toBe(401);
            expect(res.headers["content-type"]).toMatch(/application\/json/);
            expect(res.headers.location).toBeUndefined();
        });

        it("does not redirect /v1/owner/profile on cold start", async () => {
            const res = await env!.app.inject({
                method: "GET",
                url: "/v1/owner/profile",
            });
            expect(res.statusCode).toBe(401);
            expect(res.headers["content-type"]).toMatch(/application\/json/);
        });

        it("does not redirect /v1/authorize on cold start", async () => {
            const res = await env!.app.inject({
                method: "POST",
                url: "/v1/authorize",
                payload: {},
            });
            // Missing signing headers → 401, not 302.
            expect(res.statusCode).toBe(401);
            expect(res.headers["content-type"]).toMatch(/application\/json/);
        });
    });

    describe("self-hosted mode (legacy bootstrap path)", () => {
        beforeEach(async () => {
            env = await startServer("self_hosted");
            if (fs.existsSync(env.statePath)) fs.unlinkSync(env.statePath);
        });

        it("does not bounce /v1/... API calls to /gui when state.md is missing", async () => {
            const res = await env!.app.inject({
                method: "GET",
                url: "/v1/owner/profile",
            });
            // Before the fix: 302 to /gui. After: auth middleware decides.
            expect(res.statusCode).toBe(401);
            expect(res.headers["content-type"]).toMatch(/application\/json/);
            expect(res.headers.location).toBeUndefined();
        });

        it("still re-bootstraps and redirects browser navigation to /gui", async () => {
            const res = await env!.app.inject({
                method: "GET",
                url: "/gui/dashboard",
                headers: { accept: "text/html" },
            });
            // statePath was missing → bootstrap fires → redirect to /gui.
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe("/gui");
            // And the bootstrap should have recreated state.md.
            expect(fs.existsSync(env!.statePath)).toBe(true);
        });
    });
});
