import {
    renderPage,
    escapeHtml,
    copyableId,
    idBadge,
    formatTimestamp,
    formatNameWithId,
    infoIcon,
    INFO_AGENT_STATUS,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";
import type { AuditData } from "../audit/render.js";

// ─── Interfaces ───────────────────────────────────────────────────────

export interface AdminAgentDetailData {
    agent: {
        agent_principal_id: string;
        agent_id: string;
        owner_type: string;
        owner_id: string;
        owner_name: string | null;
        status: string;
        created_at: string;
        revoked_at: string | null;
        webhook_url: string;
        attributes: Record<string, unknown>;
    };
    policies: { policy_id: string; name: string | null; applies_to_agent_principal_id: string | null }[];
    audit: AuditData;
    auditPage: number;
    auditPageSize: number;
}

// ─── Badge helpers ────────────────────────────────────────────────────

function statusBadge(status: string): string {
    switch (status) {
        case "ACTIVE":
            return '<span class="badge badge-green">ACTIVE</span>';
        case "REVOKED":
            return '<span class="badge badge-red">REVOKED</span>';
        default:
            return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
    }
}

// ─── Detail page ──────────────────────────────────────────────────────

export function renderAdminAgentDetail(data: AdminAgentDetailData): string {
    const { agent, policies, audit, auditPage, auditPageSize } = data;

    const ownerHref = agent.owner_type === "org"
        ? `/gui/admin/organizations/${escapeHtml(agent.owner_id)}`
        : `/gui/admin/users/${escapeHtml(agent.owner_id)}`;

    const policyRows = policies.map((p) => `<tr>
      <td><a href="/gui/admin/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.name || "Unnamed")}</a>${idBadge(p.policy_id)}</td>
      <td>${p.applies_to_agent_principal_id ? `${escapeHtml(agent.agent_id)}${idBadge(p.applies_to_agent_principal_id)}` : '<span class="text-muted">all agents</span>'}</td>
    </tr>`).join("\n");

    const attrEntries = Object.entries(agent.attributes);
    const attrRows = attrEntries.map(([key, val]) => {
        const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `<tr><td class="aagt-detail-label">${escapeHtml(key)}</td><td class="mono">${escapeHtml(valStr)}</td></tr>`;
    }).join("\n");

    // Build inline audit table (reuse audit render for the table body only)
    const total = audit.total;
    const totalPages = Math.max(1, Math.ceil(total / auditPageSize));
    const items = [...audit.items].reverse();
    const offset = (auditPage - 1) * auditPageSize;

    const auditBasePath = `/gui/admin/agents/${agent.agent_principal_id}`;

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

    const auditRows = items.map((e) => `<tr>
      <td>${formatTimestamp(e.timestamp)}</td>
      <td>${eventBadge(e.event_type)}</td>
      <td>${copyableId(e.event_id)}</td>
    </tr>`).join("");

    const pageStart = total === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + auditPageSize, total);
    const prevDisabled = auditPage <= 1 ? " disabled" : "";
    const nextDisabled = auditPage >= totalPages ? " disabled" : "";
    const prevHref = auditPage > 1 ? `${auditBasePath}?audit_page=${auditPage - 1}&audit_page_size=${auditPageSize}` : "#";
    const nextHref = auditPage < totalPages ? `${auditBasePath}?audit_page=${auditPage + 1}&audit_page_size=${auditPageSize}` : "#";

    const content = `
    <div class="page-header">
      <div class="aagt-detail-heading">
        <h2><span class="material-symbols-outlined">smart_toy</span> ${escapeHtml(agent.agent_id)}</h2>
        ${statusBadge(agent.status)}${infoIcon("agent-detail-status", INFO_AGENT_STATUS)}
      </div>
      <p>${copyableId(agent.agent_principal_id, agent.agent_principal_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr><td class="aagt-detail-label">Agent ID</td><td class="mono">${escapeHtml(agent.agent_id)}</td></tr>
          <tr><td class="aagt-detail-label">Principal ID</td><td>${copyableId(agent.agent_principal_id, agent.agent_principal_id.length)}</td></tr>
          <tr><td class="aagt-detail-label">Owner</td><td><a href="${ownerHref}" class="table-link">${formatNameWithId(agent.owner_name ?? undefined, agent.owner_id)}</a> <span class="badge badge-muted">${escapeHtml(agent.owner_type)}</span></td></tr>
          <tr><td class="aagt-detail-label">Status</td><td>${statusBadge(agent.status)}</td></tr>
          <tr><td class="aagt-detail-label">Created</td><td class="mono">${formatTimestamp(agent.created_at)}</td></tr>
          ${agent.revoked_at ? `<tr><td class="aagt-detail-label">Revoked</td><td class="mono">${formatTimestamp(agent.revoked_at)}</td></tr>` : ""}
          <tr><td class="aagt-detail-label">Webhook URL</td><td class="mono">${agent.webhook_url ? escapeHtml(agent.webhook_url) : '<span class="text-muted">None</span>'}</td></tr>
        </tbody>
      </table>
    </div>

    ${attrEntries.length > 0 ? `<div class="card">
      <div class="card-title">Attributes</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>${attrRows}</tbody>
      </table>
    </div>` : ""}

    <div class="card">
      <div class="card-title">Policies (${policies.length})</div>
      ${policies.length === 0
        ? '<p class="aagt-empty-section">No policies target this agent</p>'
        : `<table>
          <thead><tr><th>Name</th><th>Applies to</th></tr></thead>
          <tbody>${policyRows}</tbody>
        </table>`}
    </div>

    <div class="card">
      <div class="card-title">Audit Log (${total} events)</div>
      ${total === 0
        ? '<p class="aagt-empty-section">No audit events for this agent</p>'
        : `<table>
          <colgroup><col style="width:170px"><col style="width:240px"><col></colgroup>
          <thead><tr><th>Timestamp</th><th>Event</th><th>Event ID</th></tr></thead>
          <tbody>${auditRows}</tbody>
        </table>
        <div class="table-pagination">
          <div class="table-pagination-info">Showing ${pageStart}--${pageEnd} of ${total}</div>
          <div class="table-pagination-controls">
            <div class="table-pagination-nav">
              <a href="${prevHref}" class="btn btn-secondary btn-sm btn-icon${prevDisabled}" title="Previous"><span class="material-symbols-outlined">chevron_left</span></a>
              <span class="table-pagination-pages">Page ${auditPage} of ${totalPages}</span>
              <a href="${nextHref}" class="btn btn-secondary btn-sm btn-icon${nextDisabled}" title="Next"><span class="material-symbols-outlined">chevron_right</span></a>
            </div>
          </div>
        </div>`}
    </div>

    <div class="toolbar">
      <a href="/gui/admin/agents" class="btn btn-secondary">Back to Agents</a>
      <button id="btn-delete-agent" class="btn btn-danger">Delete Agent</button>
    </div>

    <script>window.__PAGE_DATA__ = { agentPrincipalId: '${escapeHtml(agent.agent_principal_id)}', agentId: '${escapeHtml(agent.agent_id)}' };</script>
    ${assetTags("pages/admin-agents/client.ts")}`;

    return renderPage(agent.agent_id, content, "/gui/admin/agents");
}
