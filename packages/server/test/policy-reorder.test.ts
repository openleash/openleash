/**
 * Tests the within-tier policy reorder endpoint and that POST /policies
 * assigns rank values that step by 100.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { bootstrapState } from "../src/bootstrap.js";
import {
    readState,
    writeState,
    writeUserFile,
    writeAgentFile,
    hashPassphrase,
    signRequest,
    createFileDataStore,
} from "@openleash/core";
import type { FastifyInstance } from "fastify";

function makeKeypair() {
    const keypair = crypto.generateKeyPairSync("ed25519");
    const pubDer = keypair.publicKey.export({ type: "spki", format: "der" });
    const privDer = keypair.privateKey.export({ type: "pkcs8", format: "der" });
    return {
        publicKeyB64: (pubDer as Buffer).toString("base64"),
        privateKeyB64: (privDer as Buffer).toString("base64"),
    };
}

function authorizeRequest(
    app: FastifyInstance,
    agentId: string,
    ownerPrincipalId: string,
    privateKeyB64: string,
    actionType: string,
) {
    const action = {
        action_id: crypto.randomUUID(),
        action_type: actionType,
        requested_at: new Date().toISOString(),
        principal: { agent_id: agentId },
        subject: { principal_id: ownerPrincipalId },
        payload: {},
    };
    const bodyBytes = Buffer.from(JSON.stringify(action));
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const headers = signRequest({
        method: "POST",
        path: "/v1/authorize",
        timestamp,
        nonce,
        bodyBytes,
        privateKeyB64,
    });
    return app.inject({
        method: "POST",
        url: "/v1/authorize",
        headers: {
            "content-type": "application/json",
            "x-agent-id": agentId,
            "x-timestamp": headers["X-Timestamp"],
            "x-nonce": headers["X-Nonce"],
            "x-body-sha256": headers["X-Body-Sha256"],
            "x-signature": headers["X-Signature"],
        },
        payload: action,
    });
}

describe("Policy reorder (within-tier)", () => {
    let app: FastifyInstance;
    let dataDir: string;
    let sessionToken: string;
    let createdPolicyIds: string[] = [];

    const ownerId = crypto.randomUUID();
    const agentPid = crypto.randomUUID();
    const agentId = "agent-1";
    const keys = makeKeypair();

    beforeAll(async () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-policy-reorder-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);

        const { hash, salt } = hashPassphrase("test-passphrase");
        writeUserFile(dataDir, {
            user_principal_id: ownerId,
            display_name: "Owner",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            passphrase_hash: hash,
            passphrase_salt: salt,
            passphrase_set_at: new Date().toISOString(),
        });
        writeAgentFile(dataDir, {
            agent_principal_id: agentPid,
            agent_id: agentId,
            owner_type: "user",
            owner_id: ownerId,
            public_key_b64: keys.publicKeyB64,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });

        const state = readState(dataDir);
        state.users.push({ user_principal_id: ownerId, path: `./users/${ownerId}.md` });
        state.agents.push({
            agent_principal_id: agentPid,
            agent_id: agentId,
            owner_type: "user",
            owner_id: ownerId,
            path: `./agents/${agentPid}.md`,
        });
        writeState(dataDir, state);

        const store = createFileDataStore(dataDir);
        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();

        const loginRes = await app.inject({
            method: "POST",
            url: "/v1/owner/login",
            payload: { user_principal_id: ownerId, passphrase: "test-passphrase" },
        });
        sessionToken = JSON.parse(loginRes.body).token;
    });

    afterAll(async () => {
        await app.close();
    });

    async function createPolicy(yaml: string, name: string): Promise<string> {
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/policies",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: { policy_yaml: yaml, name },
        });
        expect(res.statusCode).toBe(200);
        return JSON.parse(res.body).policy_id;
    }

    it("POST /policies assigns rank 100, 200, 300 in creation order", async () => {
        const p1 = await createPolicy(
            `version: 1\ndefault: allow\nrules:\n  - id: r1\n    effect: allow\n    action: "read.public"\n`,
            "p1",
        );
        const p2 = await createPolicy(
            `version: 1\ndefault: allow\nrules:\n  - id: r2\n    effect: deny\n    action: "read.secret"\n`,
            "p2",
        );
        const p3 = await createPolicy(
            `version: 1\ndefault: allow\nrules:\n  - id: r3\n    effect: allow\n    action: "*"\n`,
            "p3",
        );
        createdPolicyIds = [p1, p2, p3];

        const state = readState(dataDir);
        const ranks = createdPolicyIds.map(
            (id) => state.bindings.find((b) => b.policy_id === id)?.rank,
        );
        expect(ranks).toEqual([100, 200, 300]);
    });

    it("GET /policies returns policies sorted by rank ascending", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/policies",
            headers: { authorization: `Bearer ${sessionToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.policies.map((p: { policy_id: string }) => p.policy_id)).toEqual(createdPolicyIds);
        expect(body.policies.map((p: { rank: number }) => p.rank)).toEqual([100, 200, 300]);
    });

    it("the second policy (deny read.secret) currently fires first for that action", async () => {
        const res = await authorizeRequest(app, agentId, ownerId, keys.privateKeyB64, "read.secret");
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).result).toBe("DENY");
    });

    it("PUT /policies/order reorders by sending a full permutation", async () => {
        // Put p3 (allow *) ahead of p2 (deny read.secret) → "read.secret" now allowed.
        const reordered = [createdPolicyIds[0], createdPolicyIds[2], createdPolicyIds[1]];
        const res = await app.inject({
            method: "PUT",
            url: "/v1/owner/policies/order",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: {
                tier: "owner_wide",
                ordered_policy_ids: reordered,
            },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ reordered: 3 });

        // Ranks should now be 100, 200, 300 in the new order.
        const state = readState(dataDir);
        const newRanks = reordered.map(
            (id) => state.bindings.find((b) => b.policy_id === id)?.rank,
        );
        expect(newRanks).toEqual([100, 200, 300]);

        // Authorize now passes because p3 (allow *) fires before p2.
        const authRes = await authorizeRequest(app, agentId, ownerId, keys.privateKeyB64, "read.secret");
        expect(authRes.statusCode).toBe(200);
        expect(JSON.parse(authRes.body).result).toBe("ALLOW");
    });

    it("rejects reorder with a missing policy ID (incomplete permutation)", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/v1/owner/policies/order",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: {
                tier: "owner_wide",
                ordered_policy_ids: [createdPolicyIds[0], createdPolicyIds[1]],
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY");
    });

    it("rejects reorder with an extra policy ID from another tier", async () => {
        // Create an agent-specific policy (different tier).
        const agentScopedId = await (async () => {
            const r = await app.inject({
                method: "POST",
                url: "/v1/owner/policies",
                headers: {
                    authorization: `Bearer ${sessionToken}`,
                    "content-type": "application/json",
                },
                payload: {
                    applies_to_agent_principal_id: agentPid,
                    policy_yaml: `version: 1\ndefault: deny\nrules: []\n`,
                    name: "agent-scoped",
                },
            });
            return JSON.parse(r.body).policy_id as string;
        })();

        const res = await app.inject({
            method: "PUT",
            url: "/v1/owner/policies/order",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: {
                tier: "owner_wide",
                ordered_policy_ids: [...createdPolicyIds, agentScopedId],
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY");
    });

    it("rejects reorder with duplicate policy IDs", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/v1/owner/policies/order",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: {
                tier: "owner_wide",
                ordered_policy_ids: [createdPolicyIds[0], createdPolicyIds[0], createdPolicyIds[1]],
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY");
    });

    it("rejects reorder when ordered_policy_ids is missing or not an array", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/v1/owner/policies/order",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: {
                tier: "owner_wide",
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY");
    });

    it("rejects reorder when tier is missing or invalid", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/v1/owner/policies/order",
            headers: {
                authorization: `Bearer ${sessionToken}`,
                "content-type": "application/json",
            },
            payload: {
                ordered_policy_ids: createdPolicyIds,
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("INVALID_BODY");
    });
});
