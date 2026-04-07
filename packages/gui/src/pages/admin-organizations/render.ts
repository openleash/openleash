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
    INFO_VERIFICATION_LEVEL,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

// ─── Interfaces ───────────────────────────────────────────────────────

export interface OrgListData {
    org_id: string;
    display_name?: string;
    status?: string;
    created_at?: string;
    created_by_user_id?: string;
    verification_status?: string;
    member_count: number;
    agent_count: number;
    error?: string;
}

export interface OrgDetailData {
    org: OrgListData & {
        contact_identities?: { contact_id: string; type: string; value: string; verified: boolean }[];
        company_ids?: { id_type: string; id_value: string; country?: string; verification_level: string }[];
        identity_assurance_level?: string;
    };
    members: {
        membership_id: string;
        user_principal_id: string;
        display_name: string | null;
        role: string;
        status: string;
        created_at: string;
    }[];
    agents: { agent_id: string; agent_principal_id: string; status: string; created_at: string }[];
    policies: { policy_id: string; applies_to_agent_principal_id: string | null; name: string | null }[];
}

// ─── Badge helpers ────────────────────────────────────────────────────

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

function verificationBadge(status?: string): string {
    if (!status || status === "unverified") return '<span class="badge badge-muted">UNVERIFIED</span>';
    if (status === "pending") return '<span class="badge badge-amber">PENDING</span>';
    if (status === "verified") return '<span class="badge badge-green">VERIFIED</span>';
    if (status === "failed") return '<span class="badge badge-red">FAILED</span>';
    return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
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

// ─── List page ────────────────────────────────────────────────────────

export function renderAdminOrganizations(orgs: OrgListData[]): string {
    const rows = orgs.map((o) => {
        if (o.error) {
            return `<tr><td>${copyableId(o.org_id)}</td><td colspan="5" class="text-muted">File not found</td></tr>`;
        }
        return `<tr>
      <td><a href="/gui/admin/organizations/${escapeHtml(o.org_id)}" class="table-link">${escapeHtml(o.display_name || "—")}</a></td>
      <td>${copyableId(o.org_id)}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${verificationBadge(o.verification_status)}</td>
      <td>${o.member_count}</td>
      <td>${o.agent_count}</td>
      <td>${formatTimestamp(o.created_at || "")}</td>
    </tr>`;
    }).join("\n");

    const content = `
    <div class="page-header">
      <h2><span class="material-symbols-outlined">corporate_fare</span> Organizations</h2>
    </div>
    ${orgs.length === 0
        ? '<div class="empty-state"><span class="material-symbols-outlined">corporate_fare</span><p>No organizations yet</p></div>'
        : `<div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Org ID</th>
              <th>Status${infoIcon("org-list-status", INFO_ORG_STATUS)}</th>
              <th>Verification${infoIcon("org-list-verif", INFO_ORG_VERIFICATION)}</th>
              <th>Members</th>
              <th>Agents</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    }

    ${assetTags("pages/admin-organizations/client.ts")}`;

    return renderPage("Organizations", content, "/gui/admin/organizations");
}

// ─── Detail page ──────────────────────────────────────────────────────

export function renderAdminOrganizationDetail(data: OrgDetailData): string {
    const { org, members, agents, policies } = data;

    const memberRows = members.map((m) => `<tr>
      <td>${escapeHtml(m.display_name || "—")}</td>
      <td>${copyableId(m.user_principal_id)}</td>
      <td>${roleBadge(m.role)}</td>
      <td>${formatTimestamp(m.created_at)}</td>
    </tr>`).join("\n");

    const agentRows = agents.map((a) => `<tr>
      <td><a href="/gui/admin/agents">${escapeHtml(a.agent_id)}</a></td>
      <td>${copyableId(a.agent_principal_id)}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${formatTimestamp(a.created_at)}</td>
    </tr>`).join("\n");

    const policyRows = policies.map((p) => `<tr>
      <td>${escapeHtml(p.name || "—")}</td>
      <td>${copyableId(p.policy_id)}</td>
      <td>${p.applies_to_agent_principal_id ? copyableId(p.applies_to_agent_principal_id) : '<span class="text-muted">all agents</span>'}</td>
    </tr>`).join("\n");

    const content = `
    <div class="page-header">
      <div class="aorg-detail-heading">
        <h2>${escapeHtml(org.display_name || "Organization")}</h2>
        ${statusBadge(org.status)}${infoIcon("detail-org-status", INFO_ORG_STATUS)}
        ${verificationBadge(org.verification_status)}${infoIcon("detail-org-verif", INFO_ORG_VERIFICATION)}
      </div>
      <p>${copyableId(org.org_id, org.org_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr><td class="aorg-detail-label">Org ID</td><td>${copyableId(org.org_id, org.org_id.length)}</td></tr>
          <tr><td class="aorg-detail-label">Created</td><td class="mono">${formatTimestamp(org.created_at || "")}</td></tr>
          <tr><td class="aorg-detail-label">Created by</td><td>${org.created_by_user_id ? copyableId(org.created_by_user_id) : "—"}</td></tr>
          <tr><td class="aorg-detail-label">Assurance${infoIcon("detail-org-assurance", INFO_ORG_ASSURANCE)}</td><td>${org.identity_assurance_level || '<span class="badge badge-muted">NONE</span>'}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Members (${members.length})</div>
      ${members.length === 0
        ? '<p class="aorg-empty-section">No members</p>'
        : `<table><thead><tr><th>Name</th><th>User ID</th><th>Role${infoIcon("detail-org-role", INFO_ORG_ROLE)}</th><th>Added</th></tr></thead><tbody>${memberRows}</tbody></table>`}
    </div>

    <div class="card">
      <div class="card-title">Agents (${agents.length})</div>
      ${agents.length === 0
        ? '<p class="aorg-empty-section">No agents</p>'
        : `<table><thead><tr><th>Agent ID</th><th>Principal ID</th><th>Status</th><th>Created</th></tr></thead><tbody>${agentRows}</tbody></table>`}
    </div>

    <div class="card">
      <div class="card-title">Policies (${policies.length})</div>
      ${policies.length === 0
        ? '<p class="aorg-empty-section">No policies</p>'
        : `<table><thead><tr><th>Name</th><th>Policy ID</th><th>Applies to</th></tr></thead><tbody>${policyRows}</tbody></table>`}
    </div>

    <div class="toolbar">
      <a href="/gui/admin/organizations" class="btn btn-secondary">Back to Organizations</a>
    </div>

    ${assetTags("pages/admin-organizations/client.ts")}`;

    return renderPage(org.display_name || "Organization", content, "/gui/admin/organizations");
}
