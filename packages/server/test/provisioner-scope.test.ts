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
 * Provisioner scope: a machine principal (agent launchpad) that the owner
 * authorizes to enroll agents. Covers token minting, the /v1/provisioner/*
 * endpoints, policy auto-bind at invite redemption, and revocation.
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

function newAgentPubkeyB64(): string {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    return publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

describe("provisioner scope", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let userId: string;
    let store: DataStore;
    let cookie: string;
    let provisionerId: string;
    let provisionerToken: string;
    let policyId: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-provisioner-"));
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

        cookie = await sessionCookieFor(dataDir, userId);
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("owner mints a provisioner token (shown once)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/v1/owner/provisioners",
            headers: { cookie, "content-type": "application/json" },
            payload: { name: "claw-controller-office" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { provisioner_id: string; token: string; name: string };
        expect(body.provisioner_id).toBeTruthy();
        expect(body.token).toMatch(/^olp_/);
        expect(body.name).toBe("claw-controller-office");
        provisionerId = body.provisioner_id;
        provisionerToken = body.token;
    });

    it("owner list shows the provisioner without the token", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/owner/provisioners",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { provisioners: Array<Record<string, unknown>> };
        expect(body.provisioners).toHaveLength(1);
        expect(body.provisioners[0].provisioner_id).toBe(provisionerId);
        expect(body.provisioners[0].status).toBe("ACTIVE");
        expect(JSON.stringify(body)).not.toContain("token_hash");
        expect(JSON.stringify(body)).not.toContain(provisionerToken.split(".")[1]);
    });

    it("GET /v1/provisioner/self authenticates with the minted token", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/self",
            headers: { authorization: `Bearer ${provisionerToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as Record<string, unknown>;
        expect(body.provisioner_id).toBe(provisionerId);
        expect(body.owner_id).toBe(userId);
    });

    it("rejects a bad token", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/self",
            headers: { authorization: `Bearer olp_${provisionerId}.wrong-secret` },
        });
        expect(res.statusCode).toBe(401);
    });

    it("lists the owner's policies", async () => {
        const createRes = await app.inject({
            method: "POST",
            url: "/v1/owner/policies",
            headers: { cookie, "content-type": "application/json" },
            payload: {
                policy_yaml: "version: 1\ndefault: deny\nrules: []\n",
                name: "picoclaw-default",
                description: "Deny-all baseline",
            },
        });
        expect(createRes.statusCode).toBe(200);
        policyId = (createRes.json() as { policy_id: string }).policy_id;

        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/policies",
            headers: { authorization: `Bearer ${provisionerToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { policies: Array<Record<string, unknown>> };
        expect(body.policies.map((p) => p.policy_id)).toContain(policyId);
    });

    it("rejects enrollment against a foreign policy", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/v1/provisioner/enrollments",
            headers: {
                authorization: `Bearer ${provisionerToken}`,
                "content-type": "application/json",
            },
            payload: { agent_name: "office-agent", policy_id: crypto.randomUUID() },
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { error: { code: string } }).error.code).toBe("INVALID_POLICY");
    });

    it("creates an enrollment and redeems it with policy auto-bind", async () => {
        const enrollRes = await app.inject({
            method: "POST",
            url: "/v1/provisioner/enrollments",
            headers: {
                authorization: `Bearer ${provisionerToken}`,
                "content-type": "application/json",
            },
            payload: { agent_name: "office-agent", policy_id: policyId },
        });
        expect(enrollRes.statusCode).toBe(200);
        const enrollment = enrollRes.json() as {
            enrollment_id: string;
            invite_id: string;
            invite_token: string;
            invite_url: string;
            policy_id: string;
        };
        expect(enrollment.invite_token).toBeTruthy();
        expect(enrollment.invite_url).toContain("/v1/agents/register-with-invite");
        expect(enrollment.policy_id).toBe(policyId);

        const redeemRes = await app.inject({
            method: "POST",
            url: "/v1/agents/register-with-invite",
            headers: { "content-type": "application/json" },
            payload: {
                invite_id: enrollment.invite_id,
                invite_token: enrollment.invite_token,
                agent_id: "office-agent",
                agent_pubkey_b64: newAgentPubkeyB64(),
                webhook_url: `http://office-agent.invalid/webhook/${crypto.randomUUID()}`,
                webhook_secret: "test-secret",
                webhook_auth_token: "test-auth-token",
            },
        });
        expect(redeemRes.statusCode).toBe(200);
        const agent = redeemRes.json() as { agent_principal_id: string };

        // Agent-specific binding to the enrollment policy was created.
        const state = store.state.getState();
        const binding = state.bindings.find(
            (b) =>
                b.policy_id === policyId &&
                b.applies_to_agent_principal_id === agent.agent_principal_id,
        );
        expect(binding).toBeTruthy();

        // Agent records who enrolled it.
        const frontmatter = store.agents.read(agent.agent_principal_id);
        expect(frontmatter.attributes.enrolled_by_provisioner_id).toBe(provisionerId);
    });

    it("lists enrollments with status and resulting agent", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/enrollments",
            headers: { authorization: `Bearer ${provisionerToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as {
            enrollments: Array<{
                agent_name: string | null;
                status: string;
                agent: { agent_id: string } | null;
            }>;
        };
        expect(body.enrollments).toHaveLength(1);
        expect(body.enrollments[0].status).toBe("used");
        expect(body.enrollments[0].agent?.agent_id).toBe("office-agent");
    });

    it("enrollment without policy_id redeems with no extra binding", async () => {
        const enrollRes = await app.inject({
            method: "POST",
            url: "/v1/provisioner/enrollments",
            headers: {
                authorization: `Bearer ${provisionerToken}`,
                "content-type": "application/json",
            },
            payload: { agent_name: "unbound-agent" },
        });
        expect(enrollRes.statusCode).toBe(200);
        const enrollment = enrollRes.json() as { invite_id: string; invite_token: string };

        const redeemRes = await app.inject({
            method: "POST",
            url: "/v1/agents/register-with-invite",
            headers: { "content-type": "application/json" },
            payload: {
                invite_id: enrollment.invite_id,
                invite_token: enrollment.invite_token,
                agent_id: "unbound-agent",
                agent_pubkey_b64: newAgentPubkeyB64(),
                webhook_url: `http://unbound-agent.invalid/webhook/${crypto.randomUUID()}`,
                webhook_secret: "test-secret",
                webhook_auth_token: "test-auth-token",
            },
        });
        expect(redeemRes.statusCode).toBe(200);
        const agent = redeemRes.json() as { agent_principal_id: string };

        const state = store.state.getState();
        const bindings = state.bindings.filter(
            (b) => b.applies_to_agent_principal_id === agent.agent_principal_id,
        );
        expect(bindings).toHaveLength(0);
    });

    it("renders the owner provisioners page", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gui/personal/provisioners",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Provisioners");
        expect(res.body).toContain("claw-controller-office");
        // The secret must never be rendered.
        expect(res.body).not.toContain(provisionerToken.split(".")[1]);
    });

    it("owner revokes the provisioner; its token stops working", async () => {
        const revokeRes = await app.inject({
            method: "DELETE",
            url: `/v1/owner/provisioners/${provisionerId}`,
            headers: { cookie },
        });
        expect(revokeRes.statusCode).toBe(200);
        expect((revokeRes.json() as { status: string }).status).toBe("REVOKED");

        const res = await app.inject({
            method: "GET",
            url: "/v1/provisioner/self",
            headers: { authorization: `Bearer ${provisionerToken}` },
        });
        expect(res.statusCode).toBe(401);
        expect((res.json() as { error: { code: string } }).error.code).toBe(
            "PROVISIONER_REVOKED",
        );
    });
});
