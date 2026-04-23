import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_AGENT_STATUS,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";
import type { AuditData, AuditNameMap } from "../audit/render.js";
import {
    eventBadge,
    eventSummary,
    principalDisplay,
    renderEventFlow,
    formatMetadata,
} from "../audit/render.js";

// ─── Interfaces ───────────────────────────────────────────────────────

export interface OwnerAgentDetailData {
    agent: {
        agent_principal_id: string;
        agent_id: string;
        owner_type: "user" | "org";
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
    ownerName: string | null;
    ownerId: string;
    totpEnabled: boolean;
    requireTotp: boolean;
    /** Orgs the caller can transfer this agent to (org_admin, not the current owner). */
    transferTargets: { org_id: string; display_name: string; slug: string }[];
    /** Groups this agent currently belongs to (org-owned agents only). Empty for personal agents. */
    groupMemberships: { membership_id: string; group_id: string; group_name: string; group_slug: string }[];
    /** Groups in the owning org that the agent is NOT a member of yet. Empty for personal agents. */
    availableGroups: { group_id: string; group_name: string; group_slug: string }[];
    /** Slug of the org owning this agent — used to build group URLs. Null for personal agents. */
    orgSlug: string | null;
    /** Whether the viewer can add/remove group memberships for this agent. */
    canManageGroups: boolean;
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

export function renderOwnerAgentDetail(data: OwnerAgentDetailData, renderPageOptions?: RenderPageOptions): string {
    const { agent, policies, audit, auditPage, auditPageSize } = data;
    const policyBasePath = "/gui/policies";

    const policyRows = policies.map((p) => `<tr>
      <td>${escapeHtml(p.name || "Unnamed")}</td>
      <td>${p.applies_to_agent_principal_id ? escapeHtml(agent.agent_id) : '<span class="text-muted">all agents</span>'}</td>
    </tr>`).join("\n");

    const attrEntries = Object.entries(agent.attributes);
    const attrRows = attrEntries.map(([key, val]) => {
        const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `<tr><td class="oagd-detail-label">${escapeHtml(key)}</td><td class="mono">${escapeHtml(valStr)}</td></tr>`;
    }).join("\n");

    // Build inline audit table
    const total = audit.total;
    const totalPages = Math.max(1, Math.ceil(total / auditPageSize));
    const items = [...audit.items].reverse();
    const offset = (auditPage - 1) * auditPageSize;

    const auditBasePath = `/gui/agents/${agent.agent_principal_id}`;

    // Build a name map so audit entries can resolve principal IDs to names
    const nameMap: AuditNameMap = {
        owners: new Map(),
        agents: new Map([[agent.agent_principal_id, agent.agent_id]]),
    };
    if (data.ownerName) {
        nameMap.owners.set(data.ownerId, data.ownerName);
    }

    const auditRows = items.map((e, i) => {
        const idx = offset + items.length - 1 - i;

        const extraFields: string[] = [];
        if (e.principal_id) {
            const resolvedName = nameMap.owners.get(e.principal_id) ?? nameMap.agents.get(e.principal_id);
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
    }).join("");

    const pageStart = total === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + auditPageSize, total);
    const prevDisabled = auditPage <= 1 ? " disabled" : "";
    const nextDisabled = auditPage >= totalPages ? " disabled" : "";
    const prevHref = auditPage > 1 ? `${auditBasePath}?audit_page=${auditPage - 1}&audit_page_size=${auditPageSize}` : "#";
    const nextHref = auditPage < totalPages ? `${auditBasePath}?audit_page=${auditPage + 1}&audit_page_size=${auditPageSize}` : "#";

    const disableRevoke = data.requireTotp && !data.totpEnabled;
    const canTransfer = agent.status === "ACTIVE"
        && data.agent.owner_type === "user"
        && data.transferTargets.length > 0;

    const transferModal = canTransfer ? `
    <div id="transfer-modal" class="modal-overlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-labelledby="transfer-modal-title">
        <div class="modal-title" id="transfer-modal-title">Transfer agent to organization</div>
        <p class="oagd-transfer-help">
          The agent's principal ID and keypair are preserved, so agents in
          the wild keep authenticating. <strong>Policies do not follow</strong> —
          you'll need to attach new policies on the org side.
        </p>
        <div class="form-group">
          <label for="transfer-org-select">Target organization</label>
          <select id="transfer-org-select" class="form-select" style="width:100%">
            ${data.transferTargets.map((o) => `<option value="${escapeHtml(o.org_id)}" data-slug="${escapeHtml(o.slug)}">${escapeHtml(o.display_name)}</option>`).join("")}
          </select>
        </div>
        <div class="modal-error" id="transfer-modal-error"></div>
        <div class="modal-footer">
          <button id="btn-transfer-cancel" class="btn btn-secondary">Cancel</button>
          <button id="btn-transfer-confirm" class="btn btn-primary">Transfer</button>
        </div>
      </div>
    </div>` : "";

    const content = `
    <div class="page-header">
      <div class="oagd-detail-heading">
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
          <tr><td class="oagd-detail-label">Agent ID</td><td class="mono">${escapeHtml(agent.agent_id)}</td></tr>
          <tr><td class="oagd-detail-label">Principal ID</td><td>${copyableId(agent.agent_principal_id, agent.agent_principal_id.length)}</td></tr>
          <tr><td class="oagd-detail-label">Status</td><td>${statusBadge(agent.status)}</td></tr>
          <tr><td class="oagd-detail-label">Created</td><td class="mono">${formatTimestamp(agent.created_at)}</td></tr>
          ${agent.revoked_at ? `<tr><td class="oagd-detail-label">Revoked</td><td class="mono">${formatTimestamp(agent.revoked_at)}</td></tr>` : ""}
          <tr><td class="oagd-detail-label">Webhook URL</td><td class="mono">${agent.webhook_url ? escapeHtml(agent.webhook_url) : '<span class="text-muted">None</span>'}</td></tr>
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

    ${data.agent.owner_type === "org" && data.orgSlug ? `<div class="card">
      <div class="card-title">Policy groups (${data.groupMemberships.length})</div>
      ${data.groupMemberships.length === 0
        ? '<p class="oagd-empty-section">Not a member of any groups</p>'
        : `<div class="oagd-group-list">${data.groupMemberships.map((m) => `
          <div class="oagd-group-row" data-membership-id="${escapeHtml(m.membership_id)}" data-group-id="${escapeHtml(m.group_id)}">
            <a href="/gui/orgs/${encodeURIComponent(data.orgSlug ?? "")}/policy-groups/${encodeURIComponent(m.group_slug)}" class="table-link">${escapeHtml(m.group_name)}</a>
            ${data.canManageGroups ? `<button class="btn btn-secondary btn-sm" data-remove-from-group="${escapeHtml(m.group_id)}">Remove</button>` : ""}
          </div>`).join("")}</div>`}
      ${data.canManageGroups && data.availableGroups.length > 0 ? `
        <div class="oagd-group-add">
          <select id="oagd-add-group" class="form-select">
            <option value="">Add to a group...</option>
            ${data.availableGroups.map((g) => `<option value="${escapeHtml(g.group_id)}">${escapeHtml(g.group_name)}</option>`).join("")}
          </select>
          <button id="oagd-add-group-btn" class="btn btn-primary btn-sm">Add</button>
        </div>` : ""}
    </div>` : ""}

    <div class="card">
      <div class="card-title">Policies (${policies.length})</div>
      ${policies.length === 0
        ? '<p class="oagd-empty-section">No policies target this agent</p>'
        : `<table>
          <thead><tr><th>Name</th><th>Applies to</th></tr></thead>
          <tbody>${policyRows}</tbody>
        </table>`}
    </div>

    <div class="card">
      <div class="card-title">Audit Log (${total} events)</div>
      ${total === 0
        ? '<p class="oagd-empty-section">No audit events for this agent</p>'
        : `<table>
          <colgroup><col style="width:36px"><col style="width:170px"><col style="width:280px"><col><col style="width:220px"><col style="width:290px"></colgroup>
          <thead><tr><th></th><th>Timestamp</th><th>Event</th><th>Principal</th><th>Detail</th><th>Event ID</th></tr></thead>
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
      <a href="/gui/agents" class="btn btn-secondary">Back to Agents</a>
      ${canTransfer ? `<button id="btn-transfer-agent" class="btn btn-secondary"><span class="material-symbols-outlined">swap_horiz</span> Transfer to Organization</button>` : ""}
      ${agent.status === "ACTIVE" ? `<button id="btn-revoke-agent" class="btn btn-danger"${disableRevoke ? " disabled" : ""}>Revoke Agent</button>` : ""}
    </div>

    ${transferModal}

    <script>window.__PAGE_DATA__ = ${JSON.stringify({
        agentPrincipalId: agent.agent_principal_id,
        agentId: agent.agent_id,
        totpEnabled: data.totpEnabled,
        ownerType: data.agent.owner_type,
        orgId: data.agent.owner_type === "org" ? data.ownerId : null,
    })};</script>
    ${assetTags("pages/owner-agent-detail/client.ts")}`;

    return renderPage(agent.agent_id, content, "/gui/agents", "owner", renderPageOptions);
}
