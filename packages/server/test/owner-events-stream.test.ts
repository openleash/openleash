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
 * GET /v1/owner/events/stream — the SSE feed behind the agent activity drawer.
 * Forwards a compact nudge when an approval is created/resolved (or an audit
 * entry is appended) for a principal the caller can see. Tested against a real
 * listening socket because Fastify's inject() buffers and never completes for a
 * streaming response.
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

/** Read the stream until a `data:` line satisfies `match`, or time out. */
async function readUntil(
    body: ReadableStream<Uint8Array>,
    match: (json: Record<string, unknown>) => boolean,
    timeoutMs: number,
): Promise<Record<string, unknown>> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const deadline = Date.now() + timeoutMs;
    try {
        while (Date.now() < deadline) {
            const chunk = await Promise.race([
                reader.read(),
                new Promise<{ done: true; value: undefined }>((r) =>
                    setTimeout(() => r({ done: true, value: undefined }), deadline - Date.now()),
                ),
            ]);
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                try {
                    const json = JSON.parse(line.slice(5).trim());
                    if (match(json)) return json;
                } catch {
                    /* skip non-JSON data lines */
                }
            }
        }
    } finally {
        reader.cancel().catch(() => {});
    }
    throw new Error("timed out waiting for matching SSE event");
}

describe("GET /v1/owner/events/stream (SSE)", () => {
    let app: FastifyInstance;
    let rootDir: string;
    let dataDir: string;
    let baseUrl: string;
    let store: DataStore;
    let userId: string;
    let agentPid: string;

    function seedApproval(status: "PENDING" = "PENDING"): string {
        const approvalId = crypto.randomUUID();
        const now = new Date().toISOString();
        store.approvalRequests.write({
            approval_request_id: approvalId,
            decision_id: crypto.randomUUID(),
            agent_principal_id: agentPid,
            agent_id: "bot",
            owner_type: "user",
            owner_id: userId,
            action_type: "read",
            action_hash: "",
            action: { action_type: "read", target: {} } as never,
            justification: null,
            context: null,
            status,
            approval_token: null,
            approval_token_expires_at: null,
            resolved_at: null,
            resolved_by: null,
            denial_reason: null,
            consumed_at: null,
            created_at: now,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        store.state.updateState((s) => {
            s.approval_requests = s.approval_requests ?? [];
            s.approval_requests.push({
                approval_request_id: approvalId,
                owner_type: "user",
                owner_id: userId,
                agent_principal_id: agentPid,
                status,
                path: `./approval-requests/${approvalId}.md`,
            });
        });
        return approvalId;
    }

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-sse-"));
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
        agentPid = crypto.randomUUID();
        store.agents.write({
            agent_principal_id: agentPid,
            agent_id: "bot",
            owner_type: "user",
            owner_id: userId,
            public_key_b64: "dummy",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
        });
        store.state.updateState((s) => {
            s.users.push({ user_principal_id: userId, path: `./users/${userId}.md` });
            s.agents.push({
                agent_principal_id: agentPid,
                agent_id: "bot",
                owner_type: "user",
                owner_id: userId,
                path: `./agents/${agentPid}.md`,
            });
        });

        const { app: server } = await createServer({ config, dataDir, store });
        app = server;
        await app.listen({ port: 0, host: "127.0.0.1" });
        const addr = app.server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await app.close();
        fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("requires owner auth", async () => {
        const res = await fetch(`${baseUrl}/v1/owner/events/stream`);
        expect(res.status).toBe(401);
        await res.body?.cancel();
    });

    it("opens an event-stream and pushes a resolved nudge on approve", async () => {
        const cookie = await sessionCookieFor(dataDir, userId);
        const approvalId = seedApproval();

        const ctrl = new AbortController();
        const streamRes = await fetch(`${baseUrl}/v1/owner/events/stream`, {
            headers: { cookie },
            signal: ctrl.signal,
        });
        expect(streamRes.status).toBe(200);
        expect(streamRes.headers.get("content-type")).toContain("text/event-stream");

        // Trigger the resolution once the stream is open.
        const waitForEvent = readUntil(
            streamRes.body!,
            (j) => j.agent_principal_id === agentPid,
            4000,
        );
        const approveRes = await fetch(
            `${baseUrl}/v1/owner/approval-requests/${approvalId}/approve`,
            { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" },
        );
        expect(approveRes.status).toBe(200);

        const event = await waitForEvent;
        expect(event.agent_principal_id).toBe(agentPid);
        expect(["audit", "approval_resolved"]).toContain(event.type);

        ctrl.abort();
    });

    it("does not leak events for another user's agent", async () => {
        // A second user with their own agent + pending approval.
        const otherUser = crypto.randomUUID();
        store.users.write({
            user_principal_id: otherUser,
            display_name: "Bob",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
        });
        const otherAgent = crypto.randomUUID();
        store.agents.write({
            agent_principal_id: otherAgent,
            agent_id: "bob-bot",
            owner_type: "user",
            owner_id: otherUser,
            public_key_b64: "dummy",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            revoked_at: null,
            webhook_url: "",
        });
        store.state.updateState((s) => {
            s.users.push({ user_principal_id: otherUser, path: `./users/${otherUser}.md` });
            s.agents.push({
                agent_principal_id: otherAgent,
                agent_id: "bob-bot",
                owner_type: "user",
                owner_id: otherUser,
                path: `./agents/${otherAgent}.md`,
            });
        });
        const otherApproval = crypto.randomUUID();
        store.approvalRequests.write({
            approval_request_id: otherApproval,
            decision_id: crypto.randomUUID(),
            agent_principal_id: otherAgent,
            agent_id: "bob-bot",
            owner_type: "user",
            owner_id: otherUser,
            action_type: "read",
            action_hash: "",
            action: { action_type: "read", target: {} } as never,
            justification: null,
            context: null,
            status: "PENDING",
            approval_token: null,
            approval_token_expires_at: null,
            resolved_at: null,
            resolved_by: null,
            denial_reason: null,
            consumed_at: null,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        });
        store.state.updateState((s) => {
            s.approval_requests = s.approval_requests ?? [];
            s.approval_requests.push({
                approval_request_id: otherApproval,
                owner_type: "user",
                owner_id: otherUser,
                agent_principal_id: otherAgent,
                status: "PENDING",
                path: `./approval-requests/${otherApproval}.md`,
            });
        });

        // Alice listens; Bob resolves his own approval.
        const aliceCookie = await sessionCookieFor(dataDir, userId);
        const bobCookie = await sessionCookieFor(dataDir, otherUser);

        const ctrl = new AbortController();
        const streamRes = await fetch(`${baseUrl}/v1/owner/events/stream`, {
            headers: { cookie: aliceCookie },
            signal: ctrl.signal,
        });

        const leak = readUntil(
            streamRes.body!,
            (j) => j.agent_principal_id === otherAgent,
            1500,
        );
        await fetch(`${baseUrl}/v1/owner/approval-requests/${otherApproval}/deny`, {
            method: "POST",
            headers: { cookie: bobCookie, "content-type": "application/json" },
            body: "{}",
        });

        await expect(leak).rejects.toThrow(/timed out/);
        ctrl.abort();
    });
});
