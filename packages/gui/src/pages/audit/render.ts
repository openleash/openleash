import {
    renderPage,
    escapeHtml,
    formatNameWithId,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_AUDIT_EVENTS,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface AuditEntry {
    event_id: string;
    timestamp: string;
    event_type: string;
    principal_id: string | null;
    action_id: string | null;
    decision_id: string | null;
    metadata_json: Record<string, unknown>;
}

export interface AuditData {
    items: AuditEntry[];
    next_cursor: string | null;
    total: number;
}

export interface AuditNameMap {
    owners: Map<string, string>;
    agents: Map<string, string>;
    eventTypes?: string[];
}

function eventBadge(type: string): string {
    if (type.includes("CREATED") || type.includes("REGISTERED") || type.includes("STARTED")) {
        return `<span class="badge badge-green">${escapeHtml(type)}</span>`;
    }
    if (type.includes("DENY") || type.includes("REVOKED") || type.includes("ERROR")) {
        return `<span class="badge badge-red">${escapeHtml(type)}</span>`;
    }
    if (type.includes("UPSERTED") || type.includes("ROTATED")) {
        return `<span class="badge badge-amber">${escapeHtml(type)}</span>`;
    }
    return `<span class="badge badge-muted">${escapeHtml(type)}</span>`;
}

function resolveId(uuid: string, nameMap: AuditNameMap): string | undefined {
    return nameMap.owners.get(uuid) ?? nameMap.agents.get(uuid);
}

function principalDisplay(principalId: string | null, nameMap?: AuditNameMap): string {
    if (!principalId) return '<span class="text-muted">--</span>';
    if (!nameMap) return copyableId(principalId);
    const name = resolveId(principalId, nameMap);
    return formatNameWithId(name, principalId);
}

function resultBadge(result: string): string {
    const escaped = escapeHtml(result);
    if (result === "ALLOW") return `<span class="badge badge-green">${escaped}</span>`;
    if (result === "DENY") return `<span class="badge badge-red">${escaped}</span>`;
    if (result.startsWith("REQUIRE_")) return `<span class="badge badge-amber">${escaped}</span>`;
    return `<span class="badge badge-muted">${escaped}</span>`;
}

function validBadge(valid: boolean): string {
    return valid
        ? '<span class="badge badge-green">VALID</span>'
        : '<span class="badge badge-red">INVALID</span>';
}

function eventSummary(
    entry: AuditEntry,
    nameMap?: AuditNameMap,
    policyBasePath = "/gui/admin/policies",
): string {
    const meta = entry.metadata_json;
    switch (entry.event_type) {
        case "OWNER_CREATED":
            return meta.display_name ? escapeHtml(String(meta.display_name)) : "";
        case "AGENT_CHALLENGE_ISSUED":
        case "AGENT_REGISTERED":
            if (meta.agent_id)
                return `<span class="mono">${escapeHtml(String(meta.agent_id))}</span>`;
            if (meta.agent_principal_id && nameMap) {
                const name = resolveId(String(meta.agent_principal_id), nameMap);
                return name
                    ? escapeHtml(name)
                    : `<span class="mono">${escapeHtml(String(meta.agent_principal_id).slice(0, 8))}...</span>`;
            }
            return "";
        case "POLICY_UPSERTED":
        case "POLICY_UPDATED":
        case "POLICY_DELETED":
        case "POLICY_UNBOUND":
            if (meta.policy_id) {
                const pid = String(meta.policy_id);
                if (policyBasePath === "/gui/policies") {
                    return `<span class="mono">${escapeHtml(pid.slice(0, 8))}...</span>`;
                }
                return `<a href="${policyBasePath}/${escapeHtml(pid)}" class="table-link mono">${escapeHtml(pid.slice(0, 8))}...</a>`;
            }
            return "";
        case "AUTHORIZE_CALLED":
            return meta.action_type
                ? `<span class="mono">${escapeHtml(String(meta.action_type))}</span>`
                : "";
        case "DECISION_CREATED":
            return meta.result ? resultBadge(String(meta.result)) : "";
        case "PROOF_VERIFIED":
            if (typeof meta.valid === "boolean") return validBadge(meta.valid);
            return "";
        case "PLAYGROUND_RUN":
            return meta.scenario ? escapeHtml(String(meta.scenario)) : "";
        case "KEY_ROTATED":
            if (meta.new_kid)
                return `<span class="mono">${escapeHtml(String(meta.new_kid).slice(0, 12))}...</span>`;
            return "";
        case "SERVER_STARTED":
            return meta.bind_address ? escapeHtml(String(meta.bind_address)) : "";
        default:
            return "";
    }
}

// ─── Flow diagram helpers ──────────────────────────────────────────

const OPENLEASH_ICON = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="audit-icon-inline">
  <path d="M60 10 C32 10 18 30 18 48 C18 66 32 80 46 84 L46 88 L54 88 L54 84 C54 84 60 86 66 84 L66 88 L74 88 L74 84 C88 80 102 66 102 48 C102 30 88 10 60 10Z" stroke="currentColor" stroke-width="4" fill="none"/>
  <path d="M22 38 C8 34 2 43 6 52 C10 61 20 57 24 48 C27 42 24 38 22 38Z" stroke="currentColor" stroke-width="3" fill="none"/>
  <path d="M98 38 C112 34 118 43 114 52 C110 61 100 57 96 48 C93 42 96 38 98 38Z" stroke="currentColor" stroke-width="3" fill="none"/>
  <path d="M46 15 Q36 5 31 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M74 15 Q84 5 89 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="45" cy="30" r="5.5" fill="currentColor"/>
  <circle cx="75" cy="30" r="5.5" fill="currentColor"/>
  <path d="M28 56 C42 64 78 64 92 56" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M60 62 L60 98 Q58 106 50 108" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
  <ellipse cx="45" cy="109" rx="8" ry="4.5" fill="none" stroke="currentColor" stroke-width="3"/>
</svg>`;

function flowNode(icon: string, label: string, extraClass = "", tooltip = ""): string {
    const iconHtml =
        icon === "__openleash__"
            ? OPENLEASH_ICON
            : `<span class="material-symbols-outlined">${icon}</span>`;
    const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : "";
    return `<div class="flow-node ${extraClass}"${titleAttr}>${iconHtml}<span class="flow-node-label">${escapeHtml(label)}</span></div>`;
}

function flowArrow(colorClass = ""): string {
    return `<div class="flow-arrow ${colorClass}"><div class="flow-arrow-line"></div><div class="flow-arrow-head"></div></div>`;
}

function flowResult(icon: string, label: string, colorClass: string, tooltip = ""): string {
    const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : "";
    return `<div class="flow-node ${colorClass}"${titleAttr}><span class="material-symbols-outlined">${icon}</span><span class="flow-node-label">${escapeHtml(label)}</span></div>`;
}

function renderEventFlow(entry: AuditEntry, nameMap?: AuditNameMap): string {
    const meta = entry.metadata_json;
    const agentLabel = meta.agent_id ? String(meta.agent_id) : "Agent";
    const ownerLabel =
        nameMap && meta.owner_principal_id
            ? (resolveId(String(meta.owner_principal_id), nameMap) ?? "Owner")
            : "Owner";
    const actionLabel = meta.action_type ? String(meta.action_type) : "";

    // Build tooltip strings from metadata
    const agentTip =
        [
            meta.agent_id ? `agent_id: ${meta.agent_id}` : null,
            meta.agent_principal_id ? `agent_principal_id: ${meta.agent_principal_id}` : null,
        ]
            .filter(Boolean)
            .join("\n") || "Agent";

    const ownerTip =
        [
            meta.owner_principal_id ? `owner_principal_id: ${meta.owner_principal_id}` : null,
            meta.display_name ? `name: ${meta.display_name}` : null,
        ]
            .filter(Boolean)
            .join("\n") || "Owner";

    const decisionTip = [
        meta.decision_id ? `decision_id: ${meta.decision_id}` : null,
        meta.action_hash ? `action_hash: ${meta.action_hash}` : null,
        meta.matched_rule_id ? `matched_rule_id: ${meta.matched_rule_id}` : null,
        meta.policy_id ? `policy_id: ${meta.policy_id}` : null,
        meta.reason ? `reason: ${meta.reason}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    const proofTip = [
        meta.decision_id ? `decision_id: ${meta.decision_id}` : null,
        meta.action_hash ? `action_hash: ${meta.action_hash}` : null,
        meta.ttl_seconds ? `ttl: ${meta.ttl_seconds}s` : null,
        meta.expires_at ? `expires: ${meta.expires_at}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    const approvalTip = [
        meta.approval_request_id ? `approval_request_id: ${meta.approval_request_id}` : null,
        meta.action_type ? `action_type: ${meta.action_type}` : null,
        meta.action_hash ? `action_hash: ${meta.action_hash}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    const policyTip = meta.policy_id ? `policy_id: ${meta.policy_id}` : "";
    const draftTip = [
        meta.policy_draft_id ? `policy_draft_id: ${meta.policy_draft_id}` : null,
        meta.resulting_policy_id ? `policy_id: ${meta.resulting_policy_id}` : null,
        meta.policy_id ? `policy_id: ${meta.policy_id}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    const inviteTip = [
        meta.invite_id ? `invite_id: ${meta.invite_id}` : null,
        meta.expires_at ? `expires: ${meta.expires_at}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    const challengeTip = [
        meta.challenge_id ? `challenge_id: ${meta.challenge_id}` : null,
        meta.expires_at ? `expires: ${meta.expires_at}` : null,
    ]
        .filter(Boolean)
        .join("\n");

    let nodes: string;

    switch (entry.event_type) {
        case "AUTHORIZE_CALLED":
            nodes =
                flowNode("smart_toy", agentLabel, "", agentTip) +
                flowArrow() +
                flowNode(
                    "__openleash__",
                    "OpenLeash",
                    "",
                    actionLabel ? `action_type: ${actionLabel}` : "",
                );
            if (actionLabel)
                nodes += `<span class="flow-arrow-label">${escapeHtml(actionLabel)}</span>`;
            break;

        case "DECISION_CREATED": {
            const result = String(meta.result ?? "");
            const resultTip = decisionTip || result;
            if (result === "ALLOW") {
                nodes =
                    flowNode("smart_toy", agentLabel, "", agentTip) +
                    flowArrow() +
                    flowNode("__openleash__", "OpenLeash") +
                    flowArrow("flow-arrow-allow") +
                    flowResult("check_circle", "ALLOW", "flow-result-allow", resultTip);
            } else if (result === "DENY") {
                nodes =
                    flowNode("smart_toy", agentLabel, "", agentTip) +
                    flowArrow() +
                    flowNode("__openleash__", "OpenLeash") +
                    flowArrow("flow-arrow-deny") +
                    flowResult("cancel", "DENY", "flow-result-deny", resultTip);
            } else if (result.startsWith("REQUIRE_")) {
                nodes =
                    flowNode("smart_toy", agentLabel, "", agentTip) +
                    flowArrow() +
                    flowNode("__openleash__", "OpenLeash") +
                    flowArrow("flow-arrow-pending") +
                    flowResult("pending", result, "flow-result-pending", resultTip);
            } else {
                nodes =
                    flowNode("smart_toy", agentLabel, "", agentTip) +
                    flowArrow() +
                    flowNode("__openleash__", "OpenLeash");
            }
            break;
        }

        case "PROOF_ISSUED":
            nodes =
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("workspace_premium", "Proof Token", "flow-result-proof", proofTip);
            break;

        case "PROOF_VERIFIED": {
            const valid = meta.valid === true;
            const verifyTip = [
                meta.agent_id ? `agent_id: ${meta.agent_id}` : null,
                meta.decision_id ? `decision_id: ${meta.decision_id}` : null,
                meta.action_hash ? `action_hash: ${meta.action_hash}` : null,
                meta.reason ? `reason: ${meta.reason}` : null,
            ]
                .filter(Boolean)
                .join("\n");
            if (valid) {
                nodes =
                    flowNode("storefront", "External") +
                    flowArrow() +
                    flowNode("__openleash__", "OpenLeash") +
                    flowArrow("flow-arrow-allow") +
                    flowResult("check_circle", "Valid", "flow-result-allow", verifyTip);
            } else {
                nodes =
                    flowNode("storefront", "External") +
                    flowArrow() +
                    flowNode("__openleash__", "OpenLeash") +
                    flowArrow("flow-arrow-deny") +
                    flowResult("gpp_bad", "Invalid", "flow-result-deny", verifyTip);
            }
            break;
        }

        case "APPROVAL_REQUEST_CREATED":
            nodes =
                flowNode("smart_toy", agentLabel, "", agentTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-pending") +
                flowResult("person", ownerLabel + " (Pending)", "flow-result-pending", approvalTip);
            break;

        case "APPROVAL_REQUEST_APPROVED":
            nodes =
                flowNode("person", ownerLabel, "", ownerTip) +
                flowArrow("flow-arrow-allow") +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("check_circle", "Approved", "flow-result-allow", approvalTip);
            break;

        case "APPROVAL_REQUEST_DENIED":
            nodes =
                flowNode("person", ownerLabel, "", ownerTip) +
                flowArrow("flow-arrow-deny") +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-deny") +
                flowResult("cancel", "Denied", "flow-result-deny", approvalTip);
            break;

        case "APPROVAL_TOKEN_USED":
            nodes =
                flowNode("smart_toy", agentLabel, "", agentTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("workspace_premium", "Proof", "flow-result-proof", approvalTip);
            break;

        case "AGENT_REGISTERED":
        case "AGENT_REGISTERED_VIA_INVITE":
            nodes =
                flowNode("smart_toy", agentLabel, "", agentTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("check_circle", "Registered", "flow-result-allow", agentTip);
            break;

        case "OWNER_LOGIN":
            nodes =
                flowNode("person", ownerLabel, "", ownerTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("check_circle", "Login", "flow-result-allow");
            break;

        case "OWNER_CREATED":
            nodes =
                flowNode("admin_panel_settings", "Admin") +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("check_circle", "Owner Created", "flow-result-allow", ownerTip);
            break;

        case "POLICY_UPSERTED":
        case "POLICY_UPDATED":
        case "POLICY_DELETED":
        case "POLICY_UNBOUND":
            nodes =
                flowNode("person", ownerLabel, "", ownerTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow() +
                flowNode("policy", "Policy", "", policyTip);
            break;

        case "POLICY_DRAFT_CREATED":
            nodes =
                flowNode("smart_toy", agentLabel, "", agentTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-pending") +
                flowResult("person", ownerLabel + " (Draft)", "flow-result-pending", draftTip);
            break;

        case "POLICY_DRAFT_APPROVED":
            nodes =
                flowNode("person", ownerLabel, "", ownerTip) +
                flowArrow("flow-arrow-allow") +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("check_circle", "Draft Approved", "flow-result-allow", draftTip);
            break;

        case "POLICY_DRAFT_DENIED":
            nodes =
                flowNode("person", ownerLabel, "", ownerTip) +
                flowArrow("flow-arrow-deny") +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-deny") +
                flowResult("cancel", "Draft Denied", "flow-result-deny", draftTip);
            break;

        case "SERVER_STARTED":
            nodes =
                flowNode("__openleash__", "OpenLeash") +
                flowArrow("flow-arrow-allow") +
                flowResult("check_circle", "Started", "flow-result-allow");
            break;

        case "KEY_ROTATED":
            nodes =
                flowNode("__openleash__", "OpenLeash") +
                flowArrow() +
                flowResult(
                    "vpn_key",
                    "Key Rotated",
                    "flow-result-pending",
                    meta.new_kid ? `kid: ${meta.new_kid}` : "",
                );
            break;

        case "AGENT_CHALLENGE_ISSUED":
            nodes =
                flowNode("smart_toy", agentLabel, "", agentTip) +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow() +
                flowResult("token", "Challenge", "flow-result-pending", challengeTip);
            break;

        case "OWNER_SETUP_INVITE_CREATED":
        case "AGENT_INVITE_CREATED":
            nodes =
                flowNode("admin_panel_settings", "Admin") +
                flowArrow() +
                flowNode("__openleash__", "OpenLeash") +
                flowArrow() +
                flowResult("mail", "Invite", "flow-result-pending", inviteTip);
            break;

        default:
            nodes = flowNode("__openleash__", "OpenLeash");
            break;
    }

    return `<div class="flow-diagram">${nodes}</div>`;
}

// ─── Metadata formatting ──────────────────────────────────────────

function formatTrace(trace: {
    rules?: Array<{
        rule_id: string;
        pattern_match: boolean;
        when_match: boolean | null;
        constraints_match?: boolean | null;
        final_match: boolean;
    }>;
}): string {
    if (!trace?.rules?.length)
        return '<span class="text-muted">No rules traced</span>';
    return trace.rules
        .map((r) => {
            const pat = r.pattern_match
                ? '<span class="text-success">✓</span>'
                : '<span class="text-danger">✗</span>';
            const when =
                r.when_match === null
                    ? ""
                    : r.when_match
                      ? ' <span class="text-success">✓</span>'
                      : ' <span class="text-danger">✗</span>';
            const result = r.final_match
                ? '<span class="badge badge-green">MATCH</span>'
                : '<span class="badge badge-muted">skip</span>';
            return `<div class="audit-trace-row"><span class="mono">${escapeHtml(r.rule_id)}</span> [pattern: ${pat}]${when ? ` [when: ${when}]` : ""} → ${result}</div>`;
        })
        .join("");
}

function formatObligations(obligations: Array<{ type: string; [key: string]: unknown }>): string {
    if (!obligations?.length) return '<span class="text-muted">None</span>';
    return obligations
        .map((o) => {
            const badge = `<span class="badge badge-amber">${escapeHtml(o.type)}</span>`;
            const extra = Object.entries(o)
                .filter(([k]) => k !== "type")
                .map(([k, v]) => `${escapeHtml(k)}=${escapeHtml(String(v))}`)
                .join(", ");
            return `<div class="audit-trace-row">${badge}${extra ? ` <span class="mono audit-meta-extra">${extra}</span>` : ""}</div>`;
        })
        .join("");
}

function formatJsonCollapsible(key: string, val: unknown): string {
    const json = JSON.stringify(val, null, 2);
    const escaped = escapeHtml(json);
    if (json.length < 80) {
        return `<span class="mono text-primary-force">${escaped}</span>`;
    }
    const id = "json-" + Math.random().toString(36).slice(2, 8);
    return `<details id="${id}" class="audit-collapsible"><summary class="audit-collapsible-summary">expand</summary><pre class="mono audit-collapsible-body">${escaped}</pre></details>`;
}

function formatMetadata(
    meta: Record<string, unknown>,
    nameMap?: AuditNameMap,
    policyBasePath = "/gui/admin/policies",
): string {
    const entries = Object.entries(meta);
    if (entries.length === 0) return '<span class="text-muted">No metadata</span>';

    return entries
        .map(([key, val]) => {
            const keyHtml = `<span class="audit-meta-key">${escapeHtml(key)}</span>`;

            // Resolve owner/agent principal IDs to names
            if (
                (key === "owner_principal_id" || key === "agent_principal_id") &&
                typeof val === "string" &&
                nameMap
            ) {
                const name = resolveId(val, nameMap);
                const display = formatNameWithId(name, val);
                return `<div class="audit-meta-row">${keyHtml}: <span class="text-primary-force">${display}</span></div>`;
            }

            // Link policy_id to editor (admin only — owner has no detail view)
            if (key === "policy_id" && typeof val === "string") {
                if (policyBasePath === "/gui/policies") {
                    return `<div class="audit-meta-row">${keyHtml}: <span class="mono">${escapeHtml(val)}</span></div>`;
                }
                return `<div class="audit-meta-row">${keyHtml}: <a href="${policyBasePath}/${escapeHtml(val)}" class="table-link mono">${escapeHtml(val)}</a></div>`;
            }

            // Badge for result
            if (key === "result" && typeof val === "string") {
                return `<div class="audit-meta-row">${keyHtml}: ${resultBadge(val)}</div>`;
            }

            // Badge for valid
            if (key === "valid" && typeof val === "boolean") {
                return `<div class="audit-meta-row">${keyHtml}: ${validBadge(val)}</div>`;
            }

            // Trace rendering
            if (key === "trace" && val && typeof val === "object" && !Array.isArray(val)) {
                return `<div class="audit-meta-row">${keyHtml}:<div class="audit-nested-block">${formatTrace(val as { rules?: Array<{ rule_id: string; pattern_match: boolean; when_match: boolean | null; final_match: boolean }> })}</div></div>`;
            }

            // Obligations rendering
            if (key === "obligations" && Array.isArray(val)) {
                return `<div class="audit-meta-row">${keyHtml}:<div class="audit-nested-block">${formatObligations(val as Array<{ type: string }>)}</div></div>`;
            }

            // Collapsible JSON for payload objects
            if (
                (key === "payload" ||
                    key === "action_payload" ||
                    key === "agent_attributes_json") &&
                val &&
                typeof val === "object"
            ) {
                return `<div class="audit-meta-row">${keyHtml}: ${formatJsonCollapsible(key, val)}</div>`;
            }

            const valStr = typeof val === "object" ? JSON.stringify(val, null, 2) : String(val);
            return `<div class="audit-meta-row">${keyHtml}: <span class="text-primary-force">${escapeHtml(valStr)}</span></div>`;
        })
        .join("");
}

export function renderAudit(
    data: AuditData,
    page: number,
    pageSize: number,
    nameMap?: AuditNameMap,
    context?: "admin" | "owner",
    renderPageOptions?: RenderPageOptions,
): string {
    const isOwner = context === "owner";
    const policyBasePath = isOwner ? "/gui/policies" : "/gui/admin/policies";
    const auditBasePath = isOwner ? "/gui/audit" : "/gui/admin/audit";
    const total = data.total;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // Reverse to show newest first
    const items = [...data.items].reverse();

    const offset = (page - 1) * pageSize;
    const rows = items
        .map((e, i) => {
            const idx = offset + data.items.length - 1 - i;

            const extraFields: string[] = [];
            if (e.principal_id) {
                const resolvedName =
                    nameMap?.owners.get(e.principal_id) ?? nameMap?.agents.get(e.principal_id);
                const pDisplay = resolvedName
                    ? `${escapeHtml(resolvedName)} <span class="mono audit-id-suffix">(${escapeHtml(e.principal_id)})</span>`
                    : escapeHtml(e.principal_id);
                extraFields.push(
                    `<div class="audit-meta-row"><span class="audit-meta-key">principal_id</span>: <span class="text-primary-force">${pDisplay}</span></div>`,
                );
            }
            if (e.action_id)
                extraFields.push(
                    `<div class="audit-meta-row"><span class="audit-meta-key">action_id</span>: <span class="text-primary-force">${escapeHtml(e.action_id)}</span></div>`,
                );
            if (e.decision_id)
                extraFields.push(
                    `<div class="audit-meta-row"><span class="audit-meta-key">decision_id</span>: <span class="text-primary-force">${escapeHtml(e.decision_id)}</span></div>`,
                );

            const summary = eventSummary(e, nameMap, policyBasePath);

            return `
      <tr class="accordion-row" id="row-${idx}" data-event-type="${escapeHtml(e.event_type)}">
        <td class="audit-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${formatTimestamp(e.timestamp)}</td>
        <td>${eventBadge(e.event_type)}</td>
        <td>${principalDisplay(e.principal_id, nameMap)}</td>
        <td>${summary || '<span class="text-muted">--</span>'}</td>
        <td>${copyableId(e.event_id)}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${idx}" data-event-type="${escapeHtml(e.event_type)}">
        <td colspan="6">
          <div class="accordion-content">
            ${renderEventFlow(e, nameMap)}
            ${extraFields.join("")}
            ${formatMetadata(e.metadata_json, nameMap, policyBasePath)}
          </div>
        </td>
      </tr>
    `;
        })
        .join("");

    // Build pagination footer
    const pageStart = total === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + pageSize, total);

    const prevDisabled = page <= 1 ? " disabled" : "";
    const nextDisabled = page >= totalPages ? " disabled" : "";
    const prevHref = page > 1 ? `${auditBasePath}?page=${page - 1}&page_size=${pageSize}` : "#";
    const nextHref = page < totalPages ? `${auditBasePath}?page=${page + 1}&page_size=${pageSize}` : "#";
    const firstHref = `${auditBasePath}?page=1&page_size=${pageSize}`;
    const lastHref = `${auditBasePath}?page=${totalPages}&page_size=${pageSize}`;

    const pageSizeOptions = [25, 50, 100]
        .map((s) => `<option value="${s}"${s === pageSize ? " selected" : ""}>${s}</option>`)
        .join("");

    const paginationHtml = `
      <div class="table-pagination">
        <div class="table-pagination-info">
          Showing ${pageStart}–${pageEnd} of ${total}
        </div>
        <div class="table-pagination-controls">
          <div class="table-pagination-size">
            <label>Rows</label>
            <select id="page-size" class="form-select">${pageSizeOptions}</select>
          </div>
          <div class="table-pagination-nav">
            <a href="${firstHref}" class="btn btn-secondary btn-sm btn-icon${prevDisabled}" title="First page"><span class="material-symbols-outlined">first_page</span></a>
            <a href="${prevHref}" class="btn btn-secondary btn-sm btn-icon${prevDisabled}" title="Previous page"><span class="material-symbols-outlined">chevron_left</span></a>
            <span class="table-pagination-pages">Page ${page} of ${totalPages}</span>
            <a href="${nextHref}" class="btn btn-secondary btn-sm btn-icon${nextDisabled}" title="Next page"><span class="material-symbols-outlined">chevron_right</span></a>
            <a href="${lastHref}" class="btn btn-secondary btn-sm btn-icon${nextDisabled}" title="Last page"><span class="material-symbols-outlined">last_page</span></a>
          </div>
        </div>
      </div>`;

    // Build event type filter options
    const eventTypes = nameMap?.eventTypes ?? [];
    const filterOptions = eventTypes
        .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
        .join("");

    const filterHtml =
        eventTypes.length > 0
            ? `<div class="toolbar">
        <select id="event-filter" class="form-select audit-filter-select">
          <option value="">All event types</option>
          ${filterOptions}
        </select>
        <span id="filter-count" class="audit-filter-count"></span>
      </div>`
            : "";

    const content = `
    <div class="page-header">
      <h2>Audit Log</h2>
      <p>Authorization events, newest first</p>
    </div>

    ${filterHtml}

    <div class="card">
      <table>
        <colgroup><col style="width:36px"><col style="width:170px"><col style="width:240px"><col><col style="width:180px"><col style="width:290px"></colgroup>
        <thead>
          <tr>
            <th></th>
            <th>Timestamp</th>
            <th>Event${infoIcon("audit-events", INFO_AUDIT_EVENTS)}</th>
            <th>Principal</th>
            <th>Detail</th>
            <th>Event ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" class="audit-empty-row">No audit events</td></tr>'}
        </tbody>
      </table>
      ${paginationHtml}
    </div>

    <script>window.__PAGE_DATA__ = { page: ${page}, pageSize: ${pageSize}, total: ${total}, basePath: "${auditBasePath}" };</script>
    ${assetTags("pages/audit/client.ts")}
  `;

    return renderPage("Audit Log", content, auditBasePath, context, renderPageOptions);
}
