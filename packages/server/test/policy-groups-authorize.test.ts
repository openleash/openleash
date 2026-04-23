/**
 * End-to-end: agents belonging to a policy group pick up the group's
 * policies at authorize() time. Tier order is agent-specific → group →
 * owner-wide with first-match semantics, so the baseline single-binding
 * behavior is unchanged for callers that never touch groups.
 */
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
    hashPassphrase,
    signRequest,
} from "@openleash/core";
import type { DataStore } from "@openleash/core";
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

function authorize(
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

describe("Policy groups — authorize() tier resolution", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    const ownerUserId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const agentInGroupPid = crypto.randomUUID();
    const agentOutsideGroupPid = crypto.randomUUID();
    const agentInGroupAgentId = "hr-agent";
    const agentOutsideGroupAgentId = "marketing-agent";
    const groupId = crypto.randomUUID();
    const keysIn = makeKeypair();
    const keysOut = makeKeypair();

    const policyOwnerWideId = crypto.randomUUID();
    const policyGroupHrId = crypto.randomUUID();
    const policyAgentSpecificId = crypto.randomUUID();

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-policy-groups-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        // ── Seed the owner user + org ──
        const { hash, salt } = hashPassphrase("pw");
        store.users.write({
            user_principal_id: ownerUserId,
            display_name: "Admin",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            passphrase_hash: hash,
            passphrase_salt: salt,
            passphrase_set_at: new Date().toISOString(),
        });

        store.organizations.write({
            org_id: orgId,
            slug: "acme",
            display_name: "Acme",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: ownerUserId,
            verification_status: "unverified",
        });

        // ── Two org-owned agents, one in group, one not ──
        store.agents.write({
            agent_principal_id: agentInGroupPid,
            agent_id: agentInGroupAgentId,
            owner_type: "org",
            owner_id: orgId,
            public_key_b64: keysIn.publicKeyB64,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });
        store.agents.write({
            agent_principal_id: agentOutsideGroupPid,
            agent_id: agentOutsideGroupAgentId,
            owner_type: "org",
            owner_id: orgId,
            public_key_b64: keysOut.publicKeyB64,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });

        // ── Policy group + one membership ──
        store.policyGroups.write({
            group_id: groupId,
            owner_type: "org",
            owner_id: orgId,
            name: "HR",
            slug: "hr",
            description: "Human Resources agents",
            created_at: new Date().toISOString(),
            created_by_user_id: ownerUserId,
        });
        const gmId = crypto.randomUUID();
        store.agentGroupMemberships.write({
            membership_id: gmId,
            group_id: groupId,
            agent_principal_id: agentInGroupPid,
            added_at: new Date().toISOString(),
            added_by_user_id: ownerUserId,
        });

        // ── Three policies: owner-wide allows *, group-HR denies secret.*,
        //    agent-specific allows secret.leak for the HR agent. ──
        store.policies.write(
            policyOwnerWideId,
            `version: 1\ndefault: deny\nrules:\n  - id: owner_allow_all\n    effect: allow\n    action: "*"\n`,
        );
        store.policies.write(
            policyGroupHrId,
            `version: 1\ndefault: allow\nrules:\n  - id: group_deny_secret\n    effect: deny\n    action: "secret.*"\n`,
        );
        store.policies.write(
            policyAgentSpecificId,
            `version: 1\ndefault: allow\nrules:\n  - id: agent_allow_leak\n    effect: allow\n    action: "secret.leak"\n`,
        );

        store.state.updateState((s) => {
            s.users.push({ user_principal_id: ownerUserId, path: `./users/${ownerUserId}.md` });
            s.organizations.push({ org_id: orgId, slug: "acme", path: `./organizations/${orgId}.md` });
            s.agents.push(
                { agent_principal_id: agentInGroupPid, agent_id: agentInGroupAgentId, owner_type: "org", owner_id: orgId, path: `./agents/${agentInGroupPid}.md` },
                { agent_principal_id: agentOutsideGroupPid, agent_id: agentOutsideGroupAgentId, owner_type: "org", owner_id: orgId, path: `./agents/${agentOutsideGroupPid}.md` },
            );
            s.policies.push(
                { policy_id: policyOwnerWideId, owner_type: "org", owner_id: orgId, applies_to_agent_principal_id: null, applies_to_group_id: null, name: "Owner-wide", description: null, path: `./policies/${policyOwnerWideId}.yaml` },
                { policy_id: policyGroupHrId, owner_type: "org", owner_id: orgId, applies_to_agent_principal_id: null, applies_to_group_id: groupId, name: "HR group", description: null, path: `./policies/${policyGroupHrId}.yaml` },
                { policy_id: policyAgentSpecificId, owner_type: "org", owner_id: orgId, applies_to_agent_principal_id: agentInGroupPid, applies_to_group_id: null, name: "Agent-specific", description: null, path: `./policies/${policyAgentSpecificId}.yaml` },
            );
            s.bindings.push(
                { owner_type: "org", owner_id: orgId, policy_id: policyOwnerWideId, applies_to_agent_principal_id: null, applies_to_group_id: null },
                { owner_type: "org", owner_id: orgId, policy_id: policyGroupHrId, applies_to_agent_principal_id: null, applies_to_group_id: groupId },
                { owner_type: "org", owner_id: orgId, policy_id: policyAgentSpecificId, applies_to_agent_principal_id: agentInGroupPid, applies_to_group_id: null },
            );
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("agent-specific rule wins over group rule for the same action", async () => {
        // HR group denies secret.*, but the agent-specific rule allows secret.leak.
        // Tier order agent > group means secret.leak → ALLOW.
        const res = await authorize(app, agentInGroupAgentId, orgId, keysIn.privateKeyB64, "secret.leak");
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.result).toBe("ALLOW");
        expect(body.matched_rule_id).toBe("agent_allow_leak");
    });

    it("group rule wins over owner-wide rule when agent-specific does not match", async () => {
        // Owner-wide allows *, HR group denies secret.*. Agent is in HR.
        // secret.foo → no agent-specific match, HR tier denies → DENY.
        const res = await authorize(app, agentInGroupAgentId, orgId, keysIn.privateKeyB64, "secret.foo");
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.result).toBe("DENY");
        expect(body.matched_rule_id).toBe("group_deny_secret");
    });

    it("agent outside the group falls through to owner-wide", async () => {
        // Marketing agent is not in HR. secret.foo → owner-wide allow * → ALLOW.
        const res = await authorize(app, agentOutsideGroupAgentId, orgId, keysOut.privateKeyB64, "secret.foo");
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.result).toBe("ALLOW");
        expect(body.matched_rule_id).toBe("owner_allow_all");
    });

    it("non-secret action on HR agent still hits owner-wide allow", async () => {
        // ordinary action, no agent-specific or group rule matches → owner-wide allow *.
        const res = await authorize(app, agentInGroupAgentId, orgId, keysIn.privateKeyB64, "purchase");
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).result).toBe("ALLOW");
    });
});
