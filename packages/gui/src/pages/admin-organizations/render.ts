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
    INFO_COMPANY_ID_TYPES,
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

const EU_COUNTRY_NAMES: Record<string, string> = {
    AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
    CZ: "Czech Republic", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
    DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy",
    LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands",
    PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia", SI: "Slovenia",
    ES: "Spain", SE: "Sweden",
};

function countryFlag(code: string): string {
    return String.fromCodePoint(
        ...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
}

const COMPANY_ID_LABELS: Record<string, string> = {
    COMPANY_REG: "Company Registration",
    VAT: "VAT Number",
    EORI: "EORI",
    LEI: "LEI",
    DUNS: "D-U-N-S",
    GLN: "GLN",
    ISIN: "ISIN",
    TAX_ID: "Tax ID",
    CHAMBER_OF_COMMERCE: "Chamber of Commerce",
    NAICS: "NAICS",
    SIC: "SIC",
};

function companyIdVerificationBadge(level?: string): string {
    if (!level || level === "UNVERIFIED")
        return '<span class="badge badge-muted">UNVERIFIED</span>';
    if (level === "FORMAT_VALID") return '<span class="badge badge-amber">FORMAT VALID</span>';
    if (level === "VERIFIED") return '<span class="badge badge-green">VERIFIED</span>';
    return `<span class="badge badge-muted">${escapeHtml(level)}</span>`;
}

function renderAdminContactIdentitiesCard(
    contacts: { contact_id: string; type: string; value: string; verified: boolean }[],
): string {
    const rows = contacts.map((c) => `<tr>
      <td>${escapeHtml(c.type === "EMAIL" ? "Email" : c.type === "PHONE" ? "Phone" : c.type)}</td>
      <td class="mono">${escapeHtml(c.value)}</td>
      <td>${c.verified ? '<span class="badge badge-green">VERIFIED</span>' : '<span class="badge badge-muted">UNVERIFIED</span>'}</td>
    </tr>`).join("\n");

    return `
    <div class="card">
      <div class="card-title">Contact Identities (${contacts.length})</div>
      ${contacts.length === 0
        ? '<p class="aorg-empty-section">No contact identities</p>'
        : `<table>
          <thead><tr><th>Type</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    </div>`;
}

function renderAdminCompanyIdsCard(
    companyIds: { id_type: string; id_value: string; country?: string; verification_level: string }[],
): string {
    const rows = companyIds.map((c, i) => `<tr>
      <td>${escapeHtml(COMPANY_ID_LABELS[c.id_type] ?? c.id_type)}</td>
      <td>${c.country ? `${countryFlag(c.country)} ${escapeHtml(c.country)} ${escapeHtml(EU_COUNTRY_NAMES[c.country] ?? "")}` : "—"}</td>
      <td class="mono">${escapeHtml(c.id_value)}</td>
      <td>${companyIdVerificationBadge(c.verification_level)}</td>
      <td><button class="btn btn-secondary btn-sm aorg-btn-remove-cid" data-index="${i}">Remove</button></td>
    </tr>`).join("\n");

    const countryOptions = Object.entries(EU_COUNTRY_NAMES)
        .map(([code, name]) => `<option value="${code}">${countryFlag(code)} ${name}</option>`)
        .join("");

    const idTypeOptions = Object.entries(COMPANY_ID_LABELS)
        .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v)}</option>`)
        .join("");

    return `
    <div class="card">
      <div class="aorg-members-header">
        <div class="card-title">Company IDs (${companyIds.length})${infoIcon("aorg-cid-types", INFO_COMPANY_ID_TYPES)}</div>
        <button class="btn btn-primary btn-sm" id="btn-add-cid">+ Add ID</button>
      </div>
      <div id="add-cid-form" class="hidden aorg-add-member-form">
        <div class="form-group">
          <label class="form-label" for="cid-type">ID Type</label>
          <select id="cid-type" class="form-select">${idTypeOptions}</select>
        </div>
        <div class="form-group" id="cid-country-group">
          <label class="form-label" for="cid-country">Country (for Company Reg)</label>
          <select id="cid-country" class="form-select"><option value="">— not applicable —</option>${countryOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="cid-value">ID Value</label>
          <input type="text" id="cid-value" class="form-input" placeholder="e.g. 5560360793 (SE org.nr)">
          <div class="form-help" id="cid-help">Issued by the national company registry (e.g. Bolagsverket in Sweden, Companies House in UK)</div>
          <div class="field-error" id="err-cid-value"></div>
        </div>
        <div class="aorg-add-member-actions">
          <button class="btn btn-primary btn-sm" id="btn-submit-cid">Add</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-cid">Cancel</button>
        </div>
      </div>
      ${companyIds.length === 0
        ? '<p class="aorg-empty-section">No company IDs registered</p>'
        : `<table>
          <thead><tr><th>Type</th><th>Country</th><th>Value</th><th>Status${infoIcon("aorg-cid-verif", INFO_VERIFICATION_LEVEL)}</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    </div>`;
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
      <td><select class="form-select aorg-role-select" data-user-id="${escapeHtml(m.user_principal_id)}" data-current-role="${escapeHtml(m.role)}">
        <option value="org_admin"${m.role === "org_admin" ? " selected" : ""}>Admin</option>
        <option value="org_member"${m.role === "org_member" ? " selected" : ""}>Member</option>
        <option value="org_viewer"${m.role === "org_viewer" ? " selected" : ""}>Viewer</option>
      </select></td>
      <td>${formatTimestamp(m.created_at)}</td>
      <td><button class="btn btn-secondary btn-sm aorg-btn-remove" data-user-id="${escapeHtml(m.user_principal_id)}" data-user-name="${escapeHtml(m.display_name || m.user_principal_id.slice(0, 8))}">Remove</button></td>
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
      <div class="aorg-members-header">
        <div class="card-title">Members (${members.length})</div>
        <button class="btn btn-primary btn-sm" id="btn-add-member">+ Add Member</button>
      </div>
      <div id="add-member-form" class="hidden aorg-add-member-form">
        <div class="form-group">
          <label class="form-label" for="member-user-id">Email or User Principal ID</label>
          <input type="text" id="member-user-id" class="form-input" placeholder="e.g. alice@example.com or 03aa9088-0239-...">
          <div class="field-error" id="err-member-user-id"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="member-role">Role${infoIcon("add-member-role", INFO_ORG_ROLE)}</label>
          <select id="member-role" class="form-select">
            <option value="org_member">Member</option>
            <option value="org_viewer">Viewer</option>
            <option value="org_admin">Admin</option>
          </select>
        </div>
        <div class="aorg-add-member-actions">
          <button class="btn btn-primary btn-sm" id="btn-submit-member">Add</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-member">Cancel</button>
        </div>
      </div>
      ${members.length === 0
        ? '<p class="aorg-empty-section">No members</p>'
        : `<table><thead><tr><th>Name</th><th>User ID</th><th>Role${infoIcon("detail-org-role", INFO_ORG_ROLE)}</th><th>Added</th><th>Actions</th></tr></thead><tbody>${memberRows}</tbody></table>`}
    </div>

    ${renderAdminContactIdentitiesCard(org.contact_identities ?? [])}

    ${renderAdminCompanyIdsCard(org.company_ids ?? [])}

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

    <script>window.__PAGE_DATA__ = { orgId: '${escapeHtml(org.org_id)}', companyIds: ${JSON.stringify(org.company_ids ?? [])} };</script>
    ${assetTags("pages/admin-organizations/client.ts")}`;

    return renderPage(org.display_name || "Organization", content, "/gui/admin/organizations");
}
