import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_ORG_STATUS,
    INFO_ORG_VERIFICATION,
    INFO_ORG_ROLE,
    INFO_ORG_ASSURANCE,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerOrgEntry {
    org_id: string;
    display_name?: string;
    status?: string;
    role: string;
    created_at?: string;
    verification_status?: string;
    error?: string;
}

function statusBadge(status?: string): string {
    if (!status) return '<span class="badge badge-muted">UNKNOWN</span>';
    switch (status) {
        case "ACTIVE":
            return '<span class="badge badge-green">ACTIVE</span>';
        case "SUSPENDED":
            return '<span class="badge badge-amber">SUSPENDED</span>';
        case "REVOKED":
            return '<span class="badge badge-red">REVOKED</span>';
        default:
            return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
    }
}

function roleBadge(role: string): string {
    switch (role) {
        case "org_admin":
            return '<span class="badge badge-amber">admin</span>';
        case "org_member":
            return '<span class="badge badge-green">member</span>';
        case "org_viewer":
            return '<span class="badge badge-muted">viewer</span>';
        default:
            return `<span class="badge badge-muted">${escapeHtml(role)}</span>`;
    }
}

export interface OwnerOrgDetailData {
    org: OwnerOrgEntry & {
        member_count: number;
        agent_count: number;
        identity_assurance_level?: string;
    };
    members: {
        display_name: string | null;
        user_principal_id: string;
        role: string;
        created_at: string;
    }[];
    agents: { agent_id: string; agent_principal_id: string; status: string; created_at: string }[];
    policies: { policy_id: string; applies_to_agent_principal_id: string | null; name: string | null }[];
    currentUserId: string;
}

export function renderOwnerOrganizations(orgs: OwnerOrgEntry[], renderPageOptions?: RenderPageOptions): string {
    const rows = orgs.map((o) => {
        if (o.error) {
            return `<tr><td>${copyableId(o.org_id)}</td><td colspan="4" class="text-muted">Not found</td></tr>`;
        }
        return `<tr>
      <td><a href="/gui/organizations/${escapeHtml(o.org_id)}" class="table-link">${escapeHtml(o.display_name || "—")}</a></td>
      <td>${copyableId(o.org_id)}</td>
      <td>${roleBadge(o.role)}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${formatTimestamp(o.created_at || "")}</td>
    </tr>`;
    }).join("\n");

    const content = `
    <div class="oorg-header">
      <h2>Organizations</h2>
      <button class="btn btn-primary" id="btn-create-org">+ Create Organization</button>
    </div>

    <div id="create-org-form" class="card hidden oorg-create-card">
      <h3>Create Organization</h3>
      <div class="form-group">
        <label class="form-label" for="org-name">Organization Name</label>
        <input type="text" id="org-name" class="form-input" placeholder="My Organization">
        <div class="field-error" id="err-org-name"></div>
      </div>
      <div class="oorg-create-actions">
        <button class="btn btn-primary" id="btn-submit-org">Create</button>
        <button class="btn btn-secondary" id="btn-cancel-org">Cancel</button>
      </div>
    </div>

    ${orgs.length === 0
        ? '<div class="empty-state"><span class="material-symbols-outlined">corporate_fare</span><p>You are not a member of any organizations yet.</p></div>'
        : `<div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Org ID</th>
                <th>Your Role${infoIcon("oorg-role", INFO_ORG_ROLE)}</th>
                <th>Status${infoIcon("oorg-status", INFO_ORG_STATUS)}</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`
    }

    ${assetTags("pages/owner-organizations/client.ts")}`;

    return renderPage("Organizations", content, "/gui/organizations", "owner", renderPageOptions);
}

function verificationBadge(status?: string): string {
    if (!status || status === "unverified") return '<span class="badge badge-muted">UNVERIFIED</span>';
    if (status === "pending") return '<span class="badge badge-amber">PENDING</span>';
    if (status === "verified") return '<span class="badge badge-green">VERIFIED</span>';
    return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
}

export function renderOwnerOrganizationDetail(data: OwnerOrgDetailData, renderPageOptions?: RenderPageOptions): string {
    const { org, members, agents, policies, currentUserId } = data;
    const isAdmin = org.role === "org_admin";

    const agentRows = agents.map((a) => `<tr>
      <td>${escapeHtml(a.agent_id)}</td>
      <td>${copyableId(a.agent_principal_id)}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${formatTimestamp(a.created_at)}</td>
    </tr>`).join("\n");

    const policyRows = policies.map((p) => `<tr>
      <td>${escapeHtml(p.name || "—")}</td>
      <td>${copyableId(p.policy_id)}</td>
      <td>${p.applies_to_agent_principal_id ? copyableId(p.applies_to_agent_principal_id) : '<span class="text-muted">all agents</span>'}</td>
    </tr>`).join("\n");

    const memberRows = members.map((m) => {
        const isSelf = m.user_principal_id === currentUserId;
        const roleCell = isAdmin && !isSelf
            ? `<td><select class="form-select oorg-role-select" data-user-id="${escapeHtml(m.user_principal_id)}" data-current-role="${escapeHtml(m.role)}">
                <option value="org_admin"${m.role === "org_admin" ? " selected" : ""}>Admin</option>
                <option value="org_member"${m.role === "org_member" ? " selected" : ""}>Member</option>
                <option value="org_viewer"${m.role === "org_viewer" ? " selected" : ""}>Viewer</option>
              </select></td>`
            : `<td>${roleBadge(m.role)}</td>`;
        const actionCell = isAdmin
            ? `<td>${isSelf
                ? '<span class="badge badge-muted">you</span>'
                : `<button class="btn btn-secondary btn-sm oorg-btn-remove" data-user-id="${escapeHtml(m.user_principal_id)}" data-user-name="${escapeHtml(m.display_name || m.user_principal_id.slice(0, 8))}">Remove</button>`
            }</td>`
            : "";
        return `<tr>
      <td>${escapeHtml(m.display_name || "—")}${isSelf ? ' <span class="badge badge-muted">you</span>' : ""}</td>
      <td>${copyableId(m.user_principal_id)}</td>
      ${roleCell}
      <td class="mono">${formatTimestamp(m.created_at)}</td>
      ${actionCell}
    </tr>`;
    }).join("\n");

    const content = `
    <div class="page-header">
      <div class="oorg-detail-heading">
        <h2>${escapeHtml(org.display_name || "Organization")}</h2>
        ${statusBadge(org.status)}${infoIcon("oorgd-status", INFO_ORG_STATUS)}
        ${verificationBadge(org.verification_status)}${infoIcon("oorgd-verif", INFO_ORG_VERIFICATION)}
      </div>
      <p>${copyableId(org.org_id, org.org_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr><td class="oorg-detail-label">Org ID</td><td>${copyableId(org.org_id, org.org_id.length)}</td></tr>
          <tr><td class="oorg-detail-label">Your Role${infoIcon("oorgd-role", INFO_ORG_ROLE)}</td><td>${roleBadge(org.role)}</td></tr>
          <tr><td class="oorg-detail-label">Status</td><td>${statusBadge(org.status)}</td></tr>
          <tr><td class="oorg-detail-label">Verification</td><td>${verificationBadge(org.verification_status)}</td></tr>
          <tr><td class="oorg-detail-label">Assurance${infoIcon("oorgd-assurance", INFO_ORG_ASSURANCE)}</td><td>${org.identity_assurance_level || '<span class="badge badge-muted">NONE</span>'}</td></tr>
          <tr><td class="oorg-detail-label">Created</td><td class="mono">${formatTimestamp(org.created_at || "")}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="oorg-members-header">
        <div class="card-title">Members (${members.length})</div>
        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="btn-add-member">+ Add Member</button>' : ""}
      </div>
      ${isAdmin ? `
      <div id="add-member-form" class="hidden oorg-add-member-form">
        <div class="form-group">
          <label class="form-label" for="member-user-id">Email or User Principal ID</label>
          <input type="text" id="member-user-id" class="form-input" placeholder="e.g. alice@example.com or 03aa9088-0239-...">
          <div class="field-error" id="err-member-user-id"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="member-role">Role${infoIcon("oorgd-add-role", INFO_ORG_ROLE)}</label>
          <select id="member-role" class="form-select">
            <option value="org_member">Member</option>
            <option value="org_viewer">Viewer</option>
            <option value="org_admin">Admin</option>
          </select>
        </div>
        <div class="oorg-add-member-actions">
          <button class="btn btn-primary btn-sm" id="btn-submit-member">Add</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-member">Cancel</button>
        </div>
      </div>` : ""}
      ${members.length === 0
        ? '<p class="oorg-empty-section">No members</p>'
        : `<table>
          <thead><tr><th>Name</th><th>User ID</th><th>Role${infoIcon("oorgd-mem-role", INFO_ORG_ROLE)}</th><th>Added</th>${isAdmin ? "<th>Actions</th>" : ""}</tr></thead>
          <tbody>${memberRows}</tbody>
        </table>`}
    </div>

    <div class="card">
      <div class="card-title">Agents (${agents.length})</div>
      ${agents.length === 0
        ? '<p class="oorg-empty-section">No agents registered under this organization</p>'
        : `<table>
          <thead><tr><th>Agent ID</th><th>Principal ID</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${agentRows}</tbody>
        </table>`}
    </div>

    <div class="card">
      <div class="card-title">Policies (${policies.length})</div>
      ${policies.length === 0
        ? '<p class="oorg-empty-section">No policies for this organization</p>'
        : `<table>
          <thead><tr><th>Name</th><th>Policy ID</th><th>Applies to</th></tr></thead>
          <tbody>${policyRows}</tbody>
        </table>`}
    </div>

    <div class="toolbar">
      <a href="/gui/organizations" class="btn btn-secondary">Back to Organizations</a>
      ${(() => {
        const adminCount = members.filter((m) => m.role === "org_admin").length;
        const isLastAdmin = org.role === "org_admin" && adminCount <= 1;
        const buttons: string[] = [];
        if (!isLastAdmin) {
            buttons.push('<button class="btn btn-secondary oorg-btn-leave" id="btn-leave-org">Leave Organization</button>');
        }
        if (isAdmin) {
            buttons.push('<button class="btn btn-secondary oorg-btn-danger" id="btn-delete-org">Delete Organization</button>');
        }
        return buttons.join("\n      ");
      })()}
    </div>

    <script>window.__PAGE_DATA__ = { orgId: '${escapeHtml(org.org_id)}', role: '${escapeHtml(org.role)}' };</script>
    ${assetTags("pages/owner-organizations/client.ts")}`;

    return renderPage(org.display_name || "Organization", content, "/gui/organizations", "owner", renderPageOptions);
}
