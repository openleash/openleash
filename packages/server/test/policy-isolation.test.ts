/**
 * Tests that policies are scoped to their owner and cannot leak across owners.
 *
 * Scenario: Two users (Owner A and Owner B) each with their own agent.
 * Owner A creates policies. Owner B's agent must NOT be affected by Owner A's policies.
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
    writePolicyFile,
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

describe("Policy isolation", () => {
    let app: FastifyInstance;
    let dataDir: string;

    // Owner A
    const ownerAId = crypto.randomUUID();
    const agentAId = "agent-a";
    const agentAPid = crypto.randomUUID();
    const keysA = makeKeypair();

    // Owner B
    const ownerBId = crypto.randomUUID();
    const agentBId = "agent-b";
    const agentBPid = crypto.randomUUID();
    const keysB = makeKeypair();

    // Policies
    const policyAllAgentsA = crypto.randomUUID();
    const policySpecificAgentA = crypto.randomUUID();
    const policyForB = crypto.randomUUID();

    let sessionTokenA: string;

    beforeAll(async () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-policy-isolation-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);

        // Create users
        for (const [id, name] of [[ownerAId, "Owner A"], [ownerBId, "Owner B"]] as const) {
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
            });
        }

        // Create agents
        writeAgentFile(dataDir, {
            agent_principal_id: agentAPid,
            agent_id: agentAId,
            owner_type: "user",
            owner_id: ownerAId,
            public_key_b64: keysA.publicKeyB64,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });

        writeAgentFile(dataDir, {
            agent_principal_id: agentBPid,
            agent_id: agentBId,
            owner_type: "user",
            owner_id: ownerBId,
            public_key_b64: keysB.publicKeyB64,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });

        // Policy 1: Owner A's policy for all their agents (null applies_to)
        writePolicyFile(dataDir, policyAllAgentsA, `version: 1\ndefault: allow\nrules: []\n`);

        // Policy 2: Owner A's policy specifically targeting Agent A
        writePolicyFile(dataDir, policySpecificAgentA, `version: 1\ndefault: allow\nrules: []\n`);

        // Policy 3: Owner B's policy for all their agents
        writePolicyFile(dataDir, policyForB, `version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: "read"\n`);

        const state = readState(dataDir);
        state.users.push(
            { user_principal_id: ownerAId, path: `./users/${ownerAId}.md` },
            { user_principal_id: ownerBId, path: `./users/${ownerBId}.md` },
        );
        state.agents.push(
            { agent_principal_id: agentAPid, agent_id: agentAId, owner_type: "user", owner_id: ownerAId, path: `./agents/${agentAPid}.md` },
            { agent_principal_id: agentBPid, agent_id: agentBId, owner_type: "user", owner_id: ownerBId, path: `./agents/${agentBPid}.md` },
        );
        state.policies.push(
            { policy_id: policyAllAgentsA, owner_type: "user", owner_id: ownerAId, applies_to_agent_principal_id: null, name: "A-all", description: null, path: `./policies/${policyAllAgentsA}.yaml` },
            { policy_id: policySpecificAgentA, owner_type: "user", owner_id: ownerAId, applies_to_agent_principal_id: agentAPid, name: "A-specific", description: null, path: `./policies/${policySpecificAgentA}.yaml` },
            { policy_id: policyForB, owner_type: "user", owner_id: ownerBId, applies_to_agent_principal_id: null, name: "B-all", description: null, path: `./policies/${policyForB}.yaml` },
        );
        state.bindings = [
            { owner_type: "user", owner_id: ownerAId, policy_id: policyAllAgentsA, applies_to_agent_principal_id: null },
            { owner_type: "user", owner_id: ownerAId, policy_id: policySpecificAgentA, applies_to_agent_principal_id: agentAPid },
            { owner_type: "user", owner_id: ownerBId, policy_id: policyForB, applies_to_agent_principal_id: null },
        ];
        writeState(dataDir, state);

        const store = createFileDataStore(dataDir);
        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();

        // Login Owner A for policy creation tests
        const loginRes = await app.inject({
            method: "POST",
            url: "/v1/owner/login",
            payload: { user_principal_id: ownerAId, passphrase: "test-passphrase" },
        });
        sessionTokenA = JSON.parse(loginRes.body).token;
    });

    afterAll(async () => { await app.close(); });

    // ─── Authorization isolation tests ────────────────────────────────

    it("Owner A's agent is authorized by Owner A's policy", async () => {
        const res = await authorizeRequest(app, agentAId, ownerAId, keysA.privateKeyB64, "anything");
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).result).toBe("ALLOW");
    });

    it("Owner B's agent is authorized by Owner B's policy (deny by default)", async () => {
        const res = await authorizeRequest(app, agentBId, ownerBId, keysB.privateKeyB64, "write");
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).result).toBe("DENY");
    });

    it("Owner B's agent uses Owner B's policy, not Owner A's permissive policy", async () => {
        // Owner A has default:allow, Owner B has default:deny with only "read" allowed
        // If policies leaked, Agent B would get ALLOW for "write" from Owner A's policy
        const res = await authorizeRequest(app, agentBId, ownerBId, keysB.privateKeyB64, "write");
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.result).toBe("DENY");
    });

    it("Owner B's agent CAN do read (their own policy allows it)", async () => {
        const res = await authorizeRequest(app, agentBId, ownerBId, keysB.privateKeyB64, "read");
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).result).toBe("ALLOW");
    });

    // ─── Cross-owner binding injection test ───────────────────────────

    it("cross-owner binding targeting another owner's agent is not matched", async () => {
        // Manually inject a malicious binding: Owner A targets Owner B's agent
        const maliciousPolicyId = crypto.randomUUID();
        writePolicyFile(dataDir, maliciousPolicyId, `version: 1\ndefault: allow\nrules: []\n`);

        const state = readState(dataDir);
        state.policies.push({
            policy_id: maliciousPolicyId,
            owner_type: "user",
            owner_id: ownerAId,
            applies_to_agent_principal_id: agentBPid, // targeting B's agent!
            name: "malicious",
            description: null,
            path: `./policies/${maliciousPolicyId}.yaml`,
        });
        state.bindings.push({
            owner_type: "user",
            owner_id: ownerAId, // Owner A's binding...
            policy_id: maliciousPolicyId,
            applies_to_agent_principal_id: agentBPid, // ...targeting Owner B's agent
        });
        writeState(dataDir, state);

        // Owner B's agent should still use Owner B's deny policy, NOT the injected allow policy
        const res = await authorizeRequest(app, agentBId, ownerBId, keysB.privateKeyB64, "write");
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).result).toBe("DENY");
    });

    // ─── Policy creation validation tests ─────────────────────────────

    it("rejects policy creation targeting another owner's agent", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/policies",
            headers: {
                authorization: `Bearer ${sessionTokenA}`,
                "content-type": "application/json",
            },
            payload: {
                applies_to_agent_principal_id: agentBPid, // Owner B's agent
                policy_yaml: "version: 1\ndefault: allow\nrules: []\n",
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("INVALID_AGENT");
    });

    it("allows policy creation targeting own agent", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/policies",
            headers: {
                authorization: `Bearer ${sessionTokenA}`,
                "content-type": "application/json",
            },
            payload: {
                applies_to_agent_principal_id: agentAPid,
                policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
                name: "Valid targeted policy",
            },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).applies_to_agent_principal_id).toBe(agentAPid);
    });

    it("allows policy creation with null applies_to (all own agents)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/policies",
            headers: {
                authorization: `Bearer ${sessionTokenA}`,
                "content-type": "application/json",
            },
            payload: {
                policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
                name: "All agents policy",
            },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).applies_to_agent_principal_id).toBeNull();
    });
});
