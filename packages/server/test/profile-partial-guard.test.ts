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
import type { DataStore, UserFrontmatter } from "@openleash/core";
import type { FastifyInstance } from "fastify";

/**
 * Regression guard: if a partial/corrupt user record reaches the profile
 * handler, it must return 500 with PARTIAL_USER_RECORD rather than silently
 * leaking a stripped-body 200. Context: mobile clients were observed
 * interpreting a stripped-body response as "empty" and masking the real
 * provisioning bug that shipped the partial record in the first place.
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

describe("GET /v1/owner/profile — partial user record guard", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-profile-guard-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);
        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    function seedUser(fields: Partial<UserFrontmatter> & { user_principal_id: string }): void {
        store.users.write(fields as UserFrontmatter);
        store.state.updateState((s) => {
            s.users.push({
                user_principal_id: fields.user_principal_id,
                path: `./users/${fields.user_principal_id}.md`,
            });
        });
    }

    it("returns 200 for a complete user record", async () => {
        const userId = crypto.randomUUID();
        seedUser({
            user_principal_id: userId,
            display_name: "Alice",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        const cookie = await sessionCookieFor(dataDir, userId);

        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/profile",
            headers: { cookie },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as { user_principal_id?: string; display_name?: string };
        expect(body.user_principal_id).toBe(userId);
        expect(body.display_name).toBe("Alice");
    });

    it("returns 500 PARTIAL_USER_RECORD when created_at is missing", async () => {
        const userId = crypto.randomUUID();
        // Simulate the pre-0.4.3 partial provisioning bug: user has id +
        // ACTIVE status but no display_name / created_at.
        seedUser({
            user_principal_id: userId,
            status: "ACTIVE",
            attributes: {},
        } as UserFrontmatter);
        const cookie = await sessionCookieFor(dataDir, userId);

        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/profile",
            headers: { cookie },
        });

        expect(res.statusCode).toBe(500);
        const body = res.json() as { error: { code: string } };
        expect(body.error.code).toBe("PARTIAL_USER_RECORD");
    });
});
