/**
 * End-to-end QA walkthrough for the policy groups feature, hitting
 * every page and API endpoint a real user would touch in the browser.
 * Each step asserts on both the rendered HTML (looking for DOM IDs the
 * client-side JS targets, asset script tags, nav state, etc.) and the
 * JSON responses from the API.
 *
 * This catches the kinds of issues that unit tests miss — broken
 * hrefs, missing `window.__PAGE_DATA__` fields, script tags pointing
 * at wrong Vite chunks, nav items that don't highlight correctly.
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
    issueSessionToken,
    readKeyFile,
    readState,
    signRequest,
} from "@openleash/core";
import type { DataStore } from "@openleash/core";
import type { FastifyInstance } from "fastify";

async function sessionCookieFor(dataDir: string, userId: string): Promise<string> {
    const state = readState(dataDir);
    const kid = state.server_keys.active_kid;
    const key = readKeyFile(dataDir, kid);
    const { token } = await issueSessionToken({ key, userPrincipalId: userId, ttlSeconds: 3600 });
    return `openleash_session=${token}`;
}

function makeKeypair() {
    const kp = crypto.generateKeyPairSync("ed25519");
    return {
        publicKeyB64: (kp.publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64"),
        privateKeyB64: (kp.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer).toString("base64"),
    };
}

describe("Policy groups — full QA walkthrough", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let store: DataStore;

    const adminId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const orgSlug = "acme";
    const agentPid = crypto.randomUUID();
    const agentId = "walkthrough-agent";
    const agentKeys = makeKeypair();
    let cookie: string;

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-pg-walkthrough-"));
        dataDir = path.join(rootDir, "data");
        bootstrapState(rootDir);
        const config = loadConfig(rootDir);
        store = createFileDataStore(dataDir);

        // Seed admin user + org + admin membership + one org-owned agent.
        store.users.write({
            user_principal_id: adminId,
            display_name: "Admin",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        store.organizations.write({
            org_id: orgId,
            slug: orgSlug,
            display_name: "Acme Corp",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: adminId,
            verification_status: "unverified",
        });
        const mId = crypto.randomUUID();
        store.memberships.write({
            membership_id: mId,
            org_id: orgId,
            user_principal_id: adminId,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: new Date().toISOString(),
        });
        store.agents.write({
            agent_principal_id: agentPid,
            agent_id: agentId,
            owner_type: "org",
            owner_id: orgId,
            public_key_b64: agentKeys.publicKeyB64,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
            webhook_secret: "",
            webhook_auth_token: "",
        });
        store.state.updateState((s) => {
            s.users.push({ user_principal_id: adminId, path: `./users/${adminId}.md` });
            s.organizations.push({ org_id: orgId, slug: orgSlug, path: `./organizations/${orgId}.md` });
            s.memberships.push({
                membership_id: mId,
                org_id: orgId,
                user_principal_id: adminId,
                role: "org_admin",
                path: `./memberships/${mId}.json`,
            });
            s.agents.push({
                agent_principal_id: agentPid,
                agent_id: agentId,
                owner_type: "org",
                owner_id: orgId,
                path: `./agents/${agentPid}.md`,
            });
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.ready();
        cookie = await sessionCookieFor(dataDir, adminId);
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    // ─── Step 1: nav entry visible on org pages ──────────────────────
    it("sidebar shows Policy Groups entry in org scope", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/dashboard`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // The nav entry uses the group_work icon and the label "Policy Groups",
        // and its href should be the scoped path.
        expect(res.body).toContain(`/gui/orgs/${orgSlug}/policy-groups`);
        expect(res.body).toContain("Policy Groups");
    });

    it("sidebar does NOT show Policy Groups in personal scope", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/personal/dashboard`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // "Policy Groups" should not appear in the personal-scope sidebar.
        // (Match on the hyphenated path too to be robust against label tweaks.)
        expect(res.body).not.toContain(`/gui/personal/policy-groups`);
    });

    // ─── Step 2: list page empty + create form wiring ────────────────
    it("list page renders empty state and create panel for org_admin", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // Empty-state message.
        expect(res.body).toContain("No policy groups yet");
        // Create panel DOM must be present so client.ts can toggle it.
        expect(res.body).toContain('id="btn-show-create"');
        expect(res.body).toContain('id="create-group-panel"');
        expect(res.body).toContain('id="grp-name"');
        expect(res.body).toContain('id="grp-slug"');
        expect(res.body).toContain('id="btn-grp-create"');
        // Page data exposes orgId + orgSlug + canManage for the client.
        expect(res.body).toContain(`"orgId":"${orgId}"`);
        expect(res.body).toContain(`"orgSlug":"${orgSlug}"`);
        expect(res.body).toContain('"canManage":true');
    });

    // ─── Step 3: create group via API ─────────────────────────────────
    let createdGroupId: string;
    let createdGroupSlug: string;
    it("creates a group via the API", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups`,
            headers: { cookie, "content-type": "application/json" },
            payload: { name: "Customer Support", description: "Tier 1 agents" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { group_id: string; slug: string };
        createdGroupId = body.group_id;
        createdGroupSlug = body.slug;
        expect(createdGroupSlug).toBe("customer-support");
    });

    // ─── Step 4: list page now shows the group + member count 0 ─────
    it("list page now shows the created group", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Customer Support");
        expect(res.body).toContain("customer-support");
        // The detail link must resolve.
        expect(res.body).toContain(`/gui/orgs/${orgSlug}/policy-groups/customer-support`);
    });

    // ─── Step 5: detail page — members + add-member control ─────────
    it("detail page renders with empty members and add-agent control", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups/${createdGroupSlug}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Customer Support");
        expect(res.body).toContain("Tier 1 agents");
        // Add-agent control for admin.
        expect(res.body).toContain('id="opg-add-agent"');
        expect(res.body).toContain('id="opg-add-btn"');
        // Our one org agent should appear in the dropdown.
        expect(res.body).toContain(agentId);
        // Delete button visible because no policies bound yet.
        expect(res.body).toContain('id="btn-delete-group"');
        // Page data exposes group_id for the membership API calls.
        expect(res.body).toContain(`"groupId":"${createdGroupId}"`);
    });

    // ─── Step 6: add agent to group + reload detail ─────────────────
    it("adds the agent to the group via API and the detail page reflects it", async () => {
        const addRes = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${createdGroupId}/agents/${agentPid}`,
            headers: { cookie },
        });
        expect(addRes.statusCode).toBe(200);

        const detail = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups/${createdGroupSlug}`,
            headers: { cookie },
        });
        expect(detail.statusCode).toBe(200);
        // Agent row must be visible as a link to the agent detail page.
        expect(detail.body).toContain(`/gui/orgs/${orgSlug}/agents/${agentPid}`);
        // Remove button is present for admin.
        expect(detail.body).toContain(`data-remove-member="${agentPid}"`);
    });

    // ─── Step 7: agent detail page shows the group membership ───────
    it("org agent detail page shows the group membership with a scoped link", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/agents/${agentPid}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // Section header + group name link.
        expect(res.body).toContain("Policy groups");
        expect(res.body).toContain(`/gui/orgs/${orgSlug}/policy-groups/${createdGroupSlug}`);
        // Remove-from-group button.
        expect(res.body).toContain(`data-remove-from-group="${createdGroupId}"`);
        // Page data exposes orgId so the client can build membership URLs.
        expect(res.body).toContain(`"orgId":"${orgId}"`);
    });

    // ─── Step 8: policy create form offers the group scope option ───
    it("policy create in org scope renders a scope selector with the group option", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policies/create`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // Radio options rendered.
        expect(res.body).toContain('name="applies-to" value="owner"');
        expect(res.body).toContain('name="applies-to" value="group"');
        expect(res.body).toContain('name="applies-to" value="agent"');
        // Group option is enabled since we have a group.
        expect(res.body).toMatch(/value="group"(?![^>]*disabled)/);
        // Group picker + the created group in the dropdown.
        expect(res.body).toContain('id="group-picker"');
        expect(res.body).toContain(createdGroupId);
        expect(res.body).toContain("Customer Support");
    });

    it("policy create with ?applies_to_group_id=... preselects that group", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policies/create?applies_to_group_id=${createdGroupId}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        // The group radio should be checked; the picker should not be hidden.
        expect(res.body).toMatch(/value="group"[^>]*checked/);
        expect(res.body).toMatch(/id="group-picker" class="form-group"(?!.*hidden)/);
        expect(res.body).toContain(`<option value="${createdGroupId}" selected>`);
    });

    // ─── Step 9: bind a group-scoped policy + authorize() picks it up ─
    let groupPolicyId: string;
    it("creates a group-scoped policy via the API", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/v1/owner/organizations/${orgId}/policies`,
            headers: { cookie, "content-type": "application/json" },
            payload: {
                applies_to_group_id: createdGroupId,
                name: "Support read-only",
                policy_yaml: `version: 1\ndefault: deny\nrules:\n  - id: allow_read\n    effect: allow\n    action: read\n`,
            },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { policy_id: string; applies_to_group_id: string };
        expect(body.applies_to_group_id).toBe(createdGroupId);
        groupPolicyId = body.policy_id;
    });

    it("authorize() on a group member now picks up the group policy", async () => {
        const action = {
            action_id: crypto.randomUUID(),
            action_type: "read",
            requested_at: new Date().toISOString(),
            principal: { agent_id: agentId },
            subject: { principal_id: orgId },
            payload: {},
        };
        const bodyBytes = Buffer.from(JSON.stringify(action));
        const ts = new Date().toISOString();
        const nonce = crypto.randomUUID();
        const h = signRequest({
            method: "POST",
            path: "/v1/authorize",
            timestamp: ts,
            nonce,
            bodyBytes,
            privateKeyB64: agentKeys.privateKeyB64,
        });
        const res = await app.inject({
            method: "POST",
            url: "/v1/authorize",
            headers: {
                "content-type": "application/json",
                "x-agent-id": agentId,
                "x-timestamp": h["X-Timestamp"],
                "x-nonce": h["X-Nonce"],
                "x-body-sha256": h["X-Body-Sha256"],
                "x-signature": h["X-Signature"],
            },
            payload: action,
        });
        expect(res.statusCode).toBe(200);
        const decision = res.json() as { result: string; matched_rule_id: string | null };
        expect(decision.result).toBe("ALLOW");
        expect(decision.matched_rule_id).toBe("allow_read");
    });

    // ─── Step 10: detail page now shows bound policy; delete is gated ─
    it("detail page shows the bound policy and the delete button is gone", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups/${createdGroupSlug}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Support read-only");
        expect(res.body).toContain(`/gui/orgs/${orgSlug}/policies/${groupPolicyId}`);
        // Delete button hidden once policies are bound.
        expect(res.body).not.toContain('id="btn-delete-group"');
    });

    it("deleting the group while policies bound returns 409", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${createdGroupId}`,
            headers: { cookie },
        });
        expect(res.statusCode).toBe(409);
        const body = res.json() as { error: { code: string; details?: { bound_policy_ids: string[] } } };
        expect(body.error.code).toBe("GROUP_HAS_POLICIES");
        expect(body.error.details?.bound_policy_ids).toContain(groupPolicyId);
    });

    // ─── Step 11: remove member, unbind policy, delete succeeds ──────
    it("unbind the policy and delete the group", async () => {
        // Delete the group-scoped policy first.
        const delPolicy = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policies/${groupPolicyId}`,
            headers: { cookie },
        });
        expect(delPolicy.statusCode).toBe(200);

        // Remove the agent from the group.
        const removeMember = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${createdGroupId}/agents/${agentPid}`,
            headers: { cookie },
        });
        expect(removeMember.statusCode).toBe(200);

        // Now delete should succeed.
        const delGroup = await app.inject({
            method: "DELETE",
            url: `/v1/owner/organizations/${orgId}/policy-groups/${createdGroupId}`,
            headers: { cookie },
        });
        expect(delGroup.statusCode).toBe(200);

        // And the list page reflects the empty state.
        const list = await app.inject({
            method: "GET",
            url: `/gui/orgs/${orgSlug}/policy-groups`,
            headers: { cookie },
        });
        expect(list.body).toContain("No policy groups yet");
    });
});
