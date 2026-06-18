/**
 * Agent activity drawer — a chat-style, per-agent timeline of audit events and
 * approval requests, with inline approve/deny. Loaded on every owner page; the
 * markup lives in `layout.ts` (renderAgentChatDrawer). The current scope is
 * read from the drawer's data attributes so we know which agents endpoint to
 * call (personal vs. org) and which approval routes to use.
 *
 * v1 keeps fresh via a lightweight head-poll. The poll tick is deliberately
 * isolated in `pollTick()` so it can later be replaced by an SSE EventSource
 * without touching the render path.
 */
import dayjs from "dayjs";
import { olToast, olPrompt, ol2FA } from "./common";

// ─── Types ──────────────────────────────────────────────────────────

interface AuditEvent {
    event_id: string;
    timestamp: string;
    event_type: string;
    principal_id: string | null;
    metadata_json: Record<string, unknown>;
}

interface ApprovalScope {
    owner_type: "user" | "org";
    owner_id: string;
    display_name: string;
    slug: string | null;
}

interface ApprovalRequest {
    approval_request_id: string;
    agent_principal_id: string;
    agent_id: string;
    action_type: string;
    justification: string | null;
    status: string;
    created_at: string;
    expires_at: string;
    scope?: ApprovalScope;
}

interface Agent {
    agent_principal_id: string;
    agent_id: string;
    status: string;
}

// ─── DOM handles ────────────────────────────────────────────────────

const drawer = document.getElementById("acd-drawer");
const backdrop = document.getElementById("acd-backdrop");
const trigger = document.getElementById("acd-trigger");

// Only wire up on owner pages where the drawer markup is present.
if (drawer && backdrop && trigger) {
    initAgentChat(drawer, backdrop, trigger);
}

function initAgentChat(
    drawer: HTMLElement,
    backdrop: HTMLElement,
    trigger: HTMLElement,
) {
    const select = document.getElementById("acd-agent") as HTMLSelectElement;
    const feed = document.getElementById("acd-feed")!;
    const body = document.getElementById("acd-body")!;
    const substatus = document.getElementById("acd-substatus")!;
    const loadOlderWrap = document.getElementById("acd-loadolder")!;
    const loadOlderBtn = loadOlderWrap.querySelector<HTMLButtonElement>("[data-acd-loadolder]")!;
    const live = document.getElementById("acd-live")!;
    const liveLabel = document.getElementById("acd-live-label")!;
    const refreshBtn = drawer.querySelector<HTMLButtonElement>("[data-acd-refresh]")!;
    const notifyBtn = drawer.querySelector<HTMLButtonElement>("[data-acd-notify]")!;

    const scopeType = drawer.dataset.scopeType === "org" ? "org" : "user";
    const scopeId = drawer.dataset.scopeId ?? "";
    const scopeKey = `${scopeType}:${scopeId}`;

    const WINDOW_HOURS = 24;
    const PAGE_SIZE = 50;
    // Safety-net poll. SSE drives real-time updates; this is just a backstop
    // for anything the stream misses (e.g. lapsed-to-EXPIRED approvals, which
    // append no audit entry) or while the stream is reconnecting.
    const POLL_MS = 30000;

    // ─── State ──────────────────────────────────────────────────────
    const auditById = new Map<string, AuditEvent>();
    const pendingById = new Map<string, ApprovalRequest>();
    let selectedAgent = "";
    let agentsLoaded = false;
    let auditOffset = 0; // cumulative audit events fetched for this agent
    let auditExhausted = false;
    let loading = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stream: EventSource | null = null;
    let streamConnected = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let notifyEnabled = localStorage.getItem("acd_notify") === "1";
    let audioCtx: AudioContext | null = null;
    let windowError = false; // initial-load failure, so we don't show "No activity" for an error

    // ─── Open / close ───────────────────────────────────────────────

    function isOpen(): boolean {
        return drawer.classList.contains("open");
    }

    function open() {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
        backdrop.hidden = false;
        // Force a reflow so the opacity transition runs from hidden state.
        void backdrop.offsetWidth;
        backdrop.classList.add("open");
        trigger.classList.add("is-active");
        trigger.setAttribute("aria-expanded", "true");
        localStorage.setItem("acd_open", "1");
        startStream();
        if (!agentsLoaded) {
            void loadAgents();
        } else {
            startPolling();
        }
    }

    function close() {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
        backdrop.classList.remove("open");
        trigger.classList.remove("is-active");
        trigger.setAttribute("aria-expanded", "false");
        localStorage.setItem("acd_open", "0");
        stopPolling();
        stopStream();
        // Hide backdrop after its fade-out transition.
        setTimeout(() => {
            if (!isOpen()) backdrop.hidden = true;
        }, 320);
    }

    function toggle() {
        if (isOpen()) close();
        else open();
    }

    trigger.addEventListener("click", (e) => {
        e.preventDefault();
        toggle();
    });
    drawer.querySelector("[data-acd-close]")?.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen()) close();
    });

    // ─── Polling (SSE seam) ─────────────────────────────────────────

    function startPolling() {
        if (pollTimer || !selectedAgent) return;
        pollTimer = setInterval(() => {
            if (!isOpen() || document.hidden || !selectedAgent) return;
            void pollTick();
        }, POLL_MS);
        updateLive();
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        updateLive();
    }

    function updateLive() {
        const active = streamConnected || pollTimer !== null;
        live.classList.toggle("is-paused", !active);
        liveLabel.textContent = streamConnected
            ? "Live"
            : pollTimer !== null
              ? "Auto-refreshing"
              : "Paused";
    }

    // ─── SSE stream (real-time) ─────────────────────────────────────

    function startStream() {
        if (stream || typeof EventSource === "undefined") return;
        try {
            stream = new EventSource("/v1/owner/events/stream");
        } catch {
            return;
        }
        stream.onopen = () => {
            streamConnected = true;
            updateLive();
        };
        stream.onmessage = (e) => {
            let msg: { type?: string; agent_principal_id?: string | null };
            try {
                msg = JSON.parse(e.data);
            } catch {
                return;
            }
            // Only one agent is shown at a time — refresh when the event is
            // about it (or carries no agent, e.g. a scope-level change).
            if (!msg.agent_principal_id || msg.agent_principal_id === selectedAgent) {
                scheduleRefresh();
            }
        };
        stream.onerror = () => {
            // EventSource reconnects on its own; reflect the gap in the UI and
            // lean on the safety-net poll until it recovers.
            streamConnected = false;
            updateLive();
        };
    }

    function stopStream() {
        if (stream) {
            stream.close();
            stream = null;
        }
        streamConnected = false;
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
    }

    /** Coalesce a burst of stream events into a single refetch. */
    function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (isOpen() && selectedAgent) void pollTick();
        }, 400);
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && isOpen() && selectedAgent) void pollTick();
    });

    refreshBtn.addEventListener("click", () => {
        if (selectedAgent) void pollTick();
    });

    // ─── Sound + desktop notifications ──────────────────────────────

    function updateNotifyBtn() {
        const icon = notifyBtn.querySelector(".material-symbols-outlined")!;
        icon.textContent = notifyEnabled ? "notifications_active" : "notifications_off";
        notifyBtn.classList.toggle("is-on", notifyEnabled);
        notifyBtn.title = notifyEnabled
            ? "Sound & desktop notifications on"
            : "Sound & desktop notifications off";
    }

    notifyBtn.addEventListener("click", async () => {
        notifyEnabled = !notifyEnabled;
        localStorage.setItem("acd_notify", notifyEnabled ? "1" : "0");
        updateNotifyBtn();
        if (notifyEnabled) {
            // Ask for desktop-notification permission (this click is the gesture)
            // and prime the audio context so the first chime isn't blocked.
            if ("Notification" in window && Notification.permission === "default") {
                try {
                    await Notification.requestPermission();
                } catch {
                    /* ignore */
                }
            }
            playChime();
        }
    });

    function playChime() {
        try {
            const Ctor =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext })
                    .webkitAudioContext;
            audioCtx = audioCtx || new Ctor();
            if (audioCtx.state === "suspended") void audioCtx.resume();
            const start = audioCtx.currentTime;
            // Two-note rising chime (A5 → D6).
            [880, 1174.66].forEach((freq, i) => {
                const osc = audioCtx!.createOscillator();
                const gain = audioCtx!.createGain();
                osc.type = "sine";
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(audioCtx!.destination);
                const t = start + i * 0.12;
                gain.gain.setValueAtTime(0.0001, t);
                gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
                osc.start(t);
                osc.stop(t + 0.3);
            });
        } catch {
            /* audio not available — silent */
        }
    }

    /** Chime + (when the tab is hidden) a desktop notification for new items. */
    function notifyNew(newAuditIds: string[], newPendingIds: string[]) {
        if (!notifyEnabled) return;

        let body: string;
        if (newPendingIds.length) {
            const a = pendingById.get(newPendingIds[0]);
            body = a ? `Approval requested: ${a.action_type}` : "New approval request";
        } else {
            const ev = newAuditIds
                .map((id) => auditById.get(id))
                .filter((e): e is AuditEvent => !!e)
                .sort((x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime())[0];
            if (!ev) return;
            const d = describeEvent(ev);
            const action = ev.metadata_json?.action_type as string | undefined;
            body = action ? `${d.title}: ${action}` : d.title;
        }

        playChime();

        // Desktop notification only when the tab isn't focused — no point
        // popping a toast-equivalent over a drawer the user is already watching.
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            const agentLabel = select.selectedOptions[0]?.textContent ?? "agent";
            try {
                const n = new Notification(`OpenLeash · ${agentLabel}`, {
                    body,
                    tag: "ol-activity",
                });
                n.onclick = () => {
                    window.focus();
                    n.close();
                };
            } catch {
                /* ignore */
            }
        }
    }

    updateNotifyBtn();

    // ─── Data loading ───────────────────────────────────────────────

    async function getJSON<T>(url: string): Promise<T> {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
    }

    async function loadAgents() {
        agentsLoaded = true;
        const url =
            scopeType === "org" && scopeId
                ? `/v1/owner/organizations/${encodeURIComponent(scopeId)}/agents`
                : "/v1/owner/agents";
        try {
            const data = await getJSON<{ agents: Agent[] }>(url);
            const agents = data.agents ?? [];
            if (agents.length === 0) {
                select.innerHTML = "";
                select.disabled = true;
                renderEmpty("smart_toy", "No agents in this workspace yet.");
                return;
            }
            select.disabled = false;
            select.innerHTML = agents
                .map(
                    (a) =>
                        `<option value="${escapeAttr(a.agent_principal_id)}">${escapeHtml(
                            a.agent_id,
                        )}${a.status === "REVOKED" ? " (revoked)" : ""}</option>`,
                )
                .join("");
            const remembered = localStorage.getItem(`acd_agent_${scopeKey}`);
            if (remembered && agents.some((a) => a.agent_principal_id === remembered)) {
                select.value = remembered;
            }
            selectedAgent = select.value;
            await selectAgent(selectedAgent);
        } catch {
            renderEmpty("error", "Could not load agents.");
        }
    }

    select.addEventListener("change", () => {
        void selectAgent(select.value);
    });

    async function selectAgent(agentPrincipalId: string) {
        selectedAgent = agentPrincipalId;
        if (!agentPrincipalId) return;
        localStorage.setItem(`acd_agent_${scopeKey}`, agentPrincipalId);
        auditById.clear();
        pendingById.clear();
        auditOffset = 0;
        auditExhausted = false;
        windowError = false;
        feed.innerHTML = "";
        const since = dayjs().subtract(WINDOW_HOURS, "hour").toISOString();
        await Promise.all([fetchAuditWindow(since), fetchPending()]);
        render({ scroll: "bottom" });
        startPolling();
    }

    async function fetchAuditWindow(since: string) {
        const url = `/v1/owner/audit?agent_principal_id=${encodeURIComponent(
            selectedAgent,
        )}&since=${encodeURIComponent(since)}&limit=${PAGE_SIZE}`;
        try {
            const data = await getJSON<{ items: AuditEvent[]; next_cursor: string | null }>(url);
            for (const ev of data.items) auditById.set(ev.event_id, ev);
            auditOffset = data.items.length;
            windowError = false;
        } catch {
            // Surface the failure rather than masquerading as "No activity".
            windowError = true;
        }
    }

    async function fetchPending() {
        try {
            const data = await getJSON<{ approval_requests: ApprovalRequest[] }>(
                "/v1/owner/approvals?status=PENDING",
            );
            pendingById.clear();
            for (const a of data.approval_requests ?? []) {
                if (a.agent_principal_id === selectedAgent) pendingById.set(a.approval_request_id, a);
            }
        } catch {
            /* ignore — keep last known pending set */
        }
    }

    async function loadOlder() {
        if (loading || auditExhausted || !selectedAgent) return;
        loading = true;
        loadOlderBtn.disabled = true;
        loadOlderBtn.textContent = "Loading…";
        // When the feed is currently empty (24h window had nothing), the first
        // older page IS the most recent activity, so jump to the bottom; once
        // there's history on screen, preserve the reading position instead.
        const wasEmpty = buildItems().length === 0;
        // No `since` here: deliberately page beyond the 24h window.
        const url = `/v1/owner/audit?agent_principal_id=${encodeURIComponent(
            selectedAgent,
        )}&limit=${PAGE_SIZE}&cursor=${auditOffset}`;
        try {
            const data = await getJSON<{ items: AuditEvent[]; next_cursor: string | null }>(url);
            if (data.items.length === 0) {
                auditExhausted = true;
            } else {
                for (const ev of data.items) auditById.set(ev.event_id, ev);
                auditOffset += data.items.length;
                if (data.next_cursor === null) auditExhausted = true;
            }
            render({ scroll: wasEmpty ? "bottom" : "preserve" });
        } catch {
            olToast("Could not load older activity", "error");
        } finally {
            loading = false;
            loadOlderBtn.disabled = false;
            loadOlderBtn.textContent = "Load older activity";
        }
    }

    loadOlderBtn.addEventListener("click", () => void loadOlder());

    async function pollTick() {
        const since = dayjs().subtract(WINDOW_HOURS, "hour").toISOString();
        const before = signature();
        const prevAudit = new Set(auditById.keys());
        const prevPending = new Set(pendingById.keys());
        // Head re-fetch only — newer events land at the bottom, older history
        // already loaded stays put.
        try {
            const data = await getJSON<{ items: AuditEvent[] }>(
                `/v1/owner/audit?agent_principal_id=${encodeURIComponent(
                    selectedAgent,
                )}&since=${encodeURIComponent(since)}&limit=${PAGE_SIZE}`,
            );
            for (const ev of data.items) auditById.set(ev.event_id, ev);
        } catch {
            /* ignore transient poll errors */
        }
        await fetchPending();
        if (signature() !== before) render({ scroll: "auto" });

        const newAudit = [...auditById.keys()].filter((k) => !prevAudit.has(k));
        const newPending = [...pendingById.keys()].filter((k) => !prevPending.has(k));
        if (newAudit.length || newPending.length) notifyNew(newAudit, newPending);
    }

    /** Cheap change-detection so an unchanged poll doesn't churn the DOM. */
    function signature(): string {
        return `${auditById.size}|${[...pendingById.keys()].sort().join(",")}`;
    }

    // ─── Approve / deny ─────────────────────────────────────────────

    function approvalUrl(a: ApprovalRequest, action: "approve" | "deny"): string {
        const id = encodeURIComponent(a.approval_request_id);
        if (a.scope?.owner_type === "org") {
            return `/v1/owner/organizations/${encodeURIComponent(
                a.scope.owner_id,
            )}/approval-requests/${id}/${action}`;
        }
        return `/v1/owner/approval-requests/${id}/${action}`;
    }

    async function postApproval(
        url: string,
        bodyObj: Record<string, unknown>,
    ): Promise<{ ok: true } | { ok: false; needTotp: boolean; message: string }> {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyObj),
            });
            if (res.ok) return { ok: true };
            const data = (await res.json().catch(() => ({}))) as {
                error?: { code?: string; message?: string };
            };
            const code = data.error?.code ?? "";
            return {
                ok: false,
                needTotp: res.status === 403 && code === "TOTP_REQUIRED",
                message: data.error?.message ?? "Request failed",
            };
        } catch {
            return { ok: false, needTotp: false, message: "Network error" };
        }
    }

    async function handleApproval(id: string, action: "approve" | "deny") {
        const a = pendingById.get(id);
        if (!a) return;
        const bodyObj: Record<string, unknown> = {};
        if (action === "deny") {
            const reason = await olPrompt(
                "Reason for denial (optional):",
                "Enter reason…",
                "Deny request",
            );
            if (reason === null) return;
            if (reason) bodyObj.reason = reason;
        }
        const url = approvalUrl(a, action);

        let res = await postApproval(url, bodyObj);
        if (!res.ok && res.needTotp) {
            // Server requires 2FA — collect a code and retry inside the dialog.
            const code = await ol2FA(async (totp) => {
                const retry = await postApproval(url, { ...bodyObj, totp_code: totp });
                if (retry.ok) {
                    res = retry;
                    return null;
                }
                return retry.ok ? null : retry.message;
            });
            if (code === null) return; // user cancelled
        }

        if (res.ok) {
            pendingById.delete(id); // optimistic — poll will surface the resolved row
            render({ scroll: "preserve" });
            olToast(action === "approve" ? "Approved" : "Denied", "success");
            void pollTick();
        } else {
            olToast(res.message, "error");
        }
    }

    feed.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-acd-action]");
        if (!btn) return;
        const id = btn.dataset.acdId!;
        const action = btn.dataset.acdAction as "approve" | "deny";
        void handleApproval(id, action);
    });

    // ─── Rendering ──────────────────────────────────────────────────

    interface FeedItem {
        ts: number;
        iso: string;
        key: string;
        html: string;
    }

    function buildItems(): FeedItem[] {
        const items: FeedItem[] = [];
        const pendingIds = new Set(pendingById.keys());
        for (const ev of auditById.values()) {
            // A still-pending approval is shown as an actionable card below;
            // skip its plain "created" audit row to avoid a duplicate.
            const reqId = ev.metadata_json?.approval_request_id as string | undefined;
            if (ev.event_type === "APPROVAL_REQUEST_CREATED" && reqId && pendingIds.has(reqId)) {
                continue;
            }
            items.push({
                ts: new Date(ev.timestamp).getTime(),
                iso: ev.timestamp,
                key: `a:${ev.event_id}`,
                html: renderAuditRow(ev),
            });
        }
        for (const a of pendingById.values()) {
            items.push({
                ts: new Date(a.created_at).getTime(),
                iso: a.created_at,
                key: `p:${a.approval_request_id}`,
                html: renderApprovalCard(a),
            });
        }
        items.sort((x, y) => x.ts - y.ts || x.key.localeCompare(y.key));
        return items;
    }

    function render(opts: { scroll: "bottom" | "preserve" | "auto" }) {
        const items = buildItems();
        // Keep "Load older" reachable until the server runs dry — even when the
        // 24h window is empty there may be older history to step back into.
        loadOlderWrap.hidden = auditExhausted;
        loadOlderBtn.textContent =
            items.length === 0 ? "Show earlier activity" : "Load older activity";
        renderSubstatus();

        if (items.length === 0) {
            if (windowError) {
                loadOlderWrap.hidden = true;
                feed.innerHTML = emptyHtml("error", "Couldn't load activity. Try refreshing.");
                return;
            }
            feed.innerHTML = emptyHtml(
                "history",
                auditExhausted
                    ? "No activity recorded for this agent."
                    : "No activity in the last 24 hours.",
            );
            return;
        }

        const nearBottom =
            body.scrollHeight - body.scrollTop - body.clientHeight < 80;
        const distanceFromBottom = body.scrollHeight - body.scrollTop;

        let html = "";
        let lastDay = "";
        for (const item of items) {
            const day = dayLabel(item.iso);
            if (day !== lastDay) {
                html += `<div class="acd-daysep">${escapeHtml(day)}</div>`;
                lastDay = day;
            }
            html += item.html;
        }
        feed.innerHTML = html;

        if (opts.scroll === "bottom" || (opts.scroll === "auto" && nearBottom)) {
            body.scrollTop = body.scrollHeight;
        } else if (opts.scroll === "preserve") {
            body.scrollTop = body.scrollHeight - distanceFromBottom;
        }
    }

    function renderSubstatus() {
        const pendingCount = pendingById.size;
        if (pendingCount > 0) {
            substatus.innerHTML = `<span class="badge badge-amber">${pendingCount} pending approval${
                pendingCount === 1 ? "" : "s"
            }</span>`;
        } else {
            substatus.innerHTML = "";
        }
    }

    function emptyHtml(icon: string, message: string): string {
        return `<div class="acd-empty"><span class="material-symbols-outlined">${escapeHtml(
            icon,
        )}</span>${escapeHtml(message)}</div>`;
    }

    /** Terminal empty state (no agents / error) — no "load older" affordance. */
    function renderEmpty(icon: string, message: string) {
        loadOlderWrap.hidden = true;
        feed.innerHTML = emptyHtml(icon, message);
    }

    function renderApprovalCard(a: ApprovalRequest): string {
        const expiresMs = new Date(a.expires_at).getTime();
        const expired = expiresMs <= Date.now();
        const just = a.justification
            ? `<div class="acd-row-body">${escapeHtml(a.justification)}</div>`
            : "";
        const expiry = expired
            ? `<div class="acd-row-meta">Expired ${escapeHtml(relTime(a.expires_at))}</div>`
            : `<div class="acd-row-meta">Expires ${escapeHtml(timeOnly(a.expires_at))}</div>`;
        const actions = expired
            ? `<div class="acd-row-meta">This request has expired.</div>`
            : `<div class="acd-actions">
          <button type="button" class="acd-action-btn acd-action-approve" data-acd-action="approve" data-acd-id="${escapeAttr(
              a.approval_request_id,
          )}"><span class="material-symbols-outlined">check</span>Approve</button>
          <button type="button" class="acd-action-btn acd-action-deny" data-acd-action="deny" data-acd-id="${escapeAttr(
              a.approval_request_id,
          )}"><span class="material-symbols-outlined">block</span>Deny</button>
        </div>`;
        return `<div class="acd-row is-approval">
        <div class="acd-row-head">
          <span class="material-symbols-outlined acd-row-icon">how_to_reg</span>
          <span class="acd-row-type">Approval requested</span>
          <span class="acd-row-time">${escapeHtml(timeOnly(a.created_at))}</span>
        </div>
        <div class="acd-row-body"><strong>${escapeHtml(a.action_type)}</strong></div>
        ${just}
        ${expiry}
        ${actions}
      </div>`;
    }

    function renderAuditRow(ev: AuditEvent): string {
        const d = describeEvent(ev);
        const bodyHtml = d.body ? `<div class="acd-row-body">${d.body}</div>` : "";
        return `<div class="acd-row ${d.cls}">
        <div class="acd-row-head">
          <span class="material-symbols-outlined acd-row-icon">${d.icon}</span>
          <span class="acd-row-type">${escapeHtml(d.title)}</span>
          <span class="acd-row-time">${escapeHtml(timeOnly(ev.timestamp))}</span>
        </div>
        ${bodyHtml}
      </div>`;
    }

    // ─── Event humanisation ─────────────────────────────────────────

    function describeEvent(ev: AuditEvent): {
        icon: string;
        cls: string;
        title: string;
        body: string;
    } {
        const meta = ev.metadata_json ?? {};
        const type = ev.event_type;
        const actionType = meta.action_type as string | undefined;
        const reason = (meta.denial_reason ?? meta.reason) as string | undefined;

        const KNOWN: Record<string, { icon: string; cls: string; title: string }> = {
            AGENT_REGISTERED: { icon: "smart_toy", cls: "", title: "Agent registered" },
            AGENT_REVOKED: { icon: "block", cls: "is-denied", title: "Agent revoked" },
            AGENT_TRANSFERRED: { icon: "swap_horiz", cls: "", title: "Agent transferred" },
            AUTHORIZE_CALLED: { icon: "bolt", cls: "", title: "Authorization requested" },
            DECISION_CREATED: { icon: "gavel", cls: "", title: "Decision issued" },
            APPROVAL_REQUEST_CREATED: {
                icon: "how_to_reg",
                cls: "is-approval",
                title: "Approval requested",
            },
            APPROVAL_REQUEST_APPROVED: {
                icon: "check_circle",
                cls: "is-approved",
                title: "Approval granted",
            },
            APPROVAL_REQUEST_DENIED: {
                icon: "cancel",
                cls: "is-denied",
                title: "Approval denied",
            },
            APPROVAL_REQUEST_EXPIRED: {
                icon: "schedule",
                cls: "",
                title: "Approval expired",
            },
            POLICY_UPSERTED: { icon: "policy", cls: "", title: "Policy updated" },
            POLICY_DELETED: { icon: "policy", cls: "is-denied", title: "Policy deleted" },
            POLICY_DRAFT_CREATED: { icon: "edit_note", cls: "", title: "Policy proposed" },
            POLICY_DRAFT_APPROVED: {
                icon: "check_circle",
                cls: "is-approved",
                title: "Policy draft approved",
            },
            POLICY_DRAFT_DENIED: { icon: "cancel", cls: "is-denied", title: "Policy draft denied" },
        };

        const base = KNOWN[type] ?? {
            icon: pickIcon(type),
            cls: pickClass(type),
            title: humanize(type),
        };

        const parts: string[] = [];
        const decision = (meta.decision ?? meta.decision_type) as string | undefined;
        if (actionType) parts.push(`<strong>${escapeHtml(actionType)}</strong>`);
        if (decision) parts.push(`<span class="acd-row-meta">${escapeHtml(decision)}</span>`);
        if (reason) parts.push(escapeHtml(reason));

        return { ...base, body: parts.join(" — ") };
    }

    function pickClass(type: string): string {
        if (/DENY|DENIED|REVOKED|DELETED|FAILED|EXPIRED/.test(type)) return "is-denied";
        if (/APPROVED|ALLOW|VERIFIED|ADDED|CREATED/.test(type)) return "is-approved";
        return "";
    }

    function pickIcon(type: string): string {
        if (/POLICY/.test(type)) return "policy";
        if (/AGENT/.test(type)) return "smart_toy";
        if (/APPROVAL/.test(type)) return "how_to_reg";
        if (/DECISION|AUTHORIZE/.test(type)) return "bolt";
        if (/WEBHOOK/.test(type)) return "webhook";
        return "history";
    }

    function humanize(type: string): string {
        return type
            .toLowerCase()
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    }

    // ─── Time helpers ───────────────────────────────────────────────

    function timeOnly(iso: string): string {
        return dayjs(iso).format("HH:mm");
    }

    function relTime(iso: string): string {
        const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return dayjs(iso).format("MMM D");
    }

    function dayLabel(iso: string): string {
        const d = dayjs(iso);
        const today = dayjs().startOf("day");
        const that = d.startOf("day");
        const diff = today.diff(that, "day");
        if (diff === 0) return "Today";
        if (diff === 1) return "Yesterday";
        return d.format("MMM D, YYYY");
    }

    // ─── Escaping ───────────────────────────────────────────────────

    function escapeHtml(s: string): string {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
    function escapeAttr(s: string): string {
        return escapeHtml(s);
    }

    // ─── Restore open state ─────────────────────────────────────────
    if (localStorage.getItem("acd_open") === "1") open();
}
