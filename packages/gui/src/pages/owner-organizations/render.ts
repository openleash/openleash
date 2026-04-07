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
    INFO_COMPANY_ID_TYPES,
    INFO_VERIFICATION_LEVEL,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";
import { COMPANY_REG_INFO } from "@openleash/core";

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
            return '<span class="badge badge-amber">Admin</span>';
        case "org_member":
            return '<span class="badge badge-green">Member</span>';
        case "org_viewer":
            return '<span class="badge badge-muted">Viewer</span>';
        default:
            return `<span class="badge badge-muted">${escapeHtml(role)}</span>`;
    }
}

export interface OwnerOrgDetailData {
    org: OwnerOrgEntry & {
        member_count: number;
        agent_count: number;
        identity_assurance_level?: string;
        company_ids?: { id_type: string; id_value: string; country?: string; verification_level: string }[];
        contact_identities?: { contact_id: string; type: string; value: string; verified: boolean }[];
        domains?: { domain_id: string; domain: string; verification_level: string }[];
    };
    members: {
        display_name: string | null;
        user_principal_id: string;
        role: string;
        created_at: string;
    }[];
    agents: { agent_id: string; agent_principal_id: string; status: string; created_at: string }[];
    policies: { policy_id: string; applies_to_agent_principal_id: string | null; name: string | null }[];
    pendingInvites?: { invite_id: string; user_principal_id: string; display_name: string | null; role: string; expires_at: string; created_at: string }[];
    currentUserId: string;
}

export interface PendingOrgInvite {
    invite_id: string;
    org_id: string;
    org_display_name: string | null;
    role: string;
    invited_by_name: string | null;
    expires_at: string;
}

export function renderOwnerOrganizations(orgs: OwnerOrgEntry[], renderPageOptions?: RenderPageOptions, pendingInvites?: PendingOrgInvite[]): string {
    const invites = pendingInvites ?? [];
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

    ${invites.length > 0 ? `
    <div class="card oorg-invites-card">
      <div class="card-title">Pending Invitations (${invites.length})</div>
      ${invites.map((inv) => `
      <div class="oorg-invite-row">
        <div class="oorg-invite-info">
          <strong>${escapeHtml(inv.org_display_name || inv.org_id.slice(0, 8))}</strong>
          <span class="text-muted"> — invited as ${escapeHtml(inv.role.replace("org_", ""))}${inv.invited_by_name ? ` by ${escapeHtml(inv.invited_by_name)}` : ""}</span>
        </div>
        <div class="oorg-invite-actions">
          <button class="btn btn-primary btn-sm oorg-btn-accept" data-invite-id="${escapeHtml(inv.invite_id)}">Accept</button>
          <button class="btn btn-secondary btn-sm oorg-btn-decline" data-invite-id="${escapeHtml(inv.invite_id)}">Decline</button>
        </div>
      </div>`).join("")}
    </div>` : ""}

    ${orgs.length === 0 && invites.length === 0
        ? '<div class="empty-state"><span class="material-symbols-outlined">corporate_fare</span><p>You are not a member of any organizations yet.</p></div>'
        : orgs.length === 0 ? "" : `<div class="card">
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

const COMPANY_ID_PLACEHOLDERS: Record<string, string> = {
    COMPANY_REG: "Select a country to see format",
    VAT: "e.g. SE556036079301 (with country prefix)",
    EORI: "e.g. SE5560360793 (country prefix + number)",
    LEI: "e.g. 5493006MHB84DD3ZDB09 (20 chars)",
    DUNS: "e.g. 123456789 (9 digits)",
    GLN: "e.g. 7350053850019 (13 digits)",
    ISIN: "e.g. US0378331005 (country + 10 chars)",
    TAX_ID: "e.g. EIN 12-3456789",
    CHAMBER_OF_COMMERCE: "e.g. KVK12345678",
    NAICS: "e.g. 541511 (2-6 digits)",
    SIC: "e.g. 7372 (4 digits)",
};

const COMPANY_ID_HELP: Record<string, string> = {
    COMPANY_REG: "Select a country to see issuing authority",
    VAT: "EU Value Added Tax number — includes country prefix. Issued by national tax authority.",
    EORI: "Required for EU customs. Issued by national customs authority.",
    LEI: "Global legal entity identifier (ISO 17442). Obtain from any GLEIF-accredited issuer.",
    DUNS: "Dun & Bradstreet number. Apply at dnb.com.",
    GLN: "GS1 Global Location Number. Obtain from your national GS1 organization.",
    ISIN: "Securities identifier. Assigned by national numbering agencies.",
    TAX_ID: "General tax ID for non-EU countries. Issued by national tax authority.",
    CHAMBER_OF_COMMERCE: "Registration at your national or regional Chamber of Commerce.",
    NAICS: "North American industry code. Look up at census.gov/naics.",
    SIC: "Standard industry code. Look up at sec.gov/divisions/corpfin/sic.",
};

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

function verificationBadge(status?: string): string {
    if (!status || status === "unverified") return '<span class="badge badge-muted">UNVERIFIED</span>';
    if (status === "pending") return '<span class="badge badge-amber">PENDING</span>';
    if (status === "verified") return '<span class="badge badge-green">VERIFIED</span>';
    return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
}

function renderCompanyIdsCard(
    companyIds: { id_type: string; id_value: string; country?: string; verification_level: string }[],
    isAdmin: boolean,
): string {
    const rows = companyIds.map((c, i) => {
        const typeLabel = c.id_type === "COMPANY_REG" && c.country && COMPANY_REG_INFO[c.country]
            ? COMPANY_REG_INFO[c.country].name
            : (COMPANY_ID_LABELS[c.id_type] ?? c.id_type);
        return `<tr>
      <td>${escapeHtml(typeLabel)}</td>
      <td>${c.country ? `${countryFlag(c.country)} ${escapeHtml(c.country)} ${escapeHtml(EU_COUNTRY_NAMES[c.country] ?? "")}` : "—"}</td>
      <td class="mono">${escapeHtml(c.id_value)}</td>
      <td>${companyIdVerificationBadge(c.verification_level)}</td>
      ${isAdmin ? `<td><button class="btn btn-secondary profile-btn-remove oorg-btn-remove-cid" data-index="${i}">Remove</button></td>` : ""}
    </tr>`;
    }).join("\n");

    const countryOptions = Object.entries(EU_COUNTRY_NAMES)
        .map(([code, name]) => `<option value="${code}">${countryFlag(code)} ${name}</option>`)
        .join("");

    const idTypeOptions = Object.entries(COMPANY_ID_LABELS)
        .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v)}</option>`)
        .join("");

    const addForm = isAdmin ? `
      <div id="add-cid-form" class="hidden oorg-add-member-form">
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
          <input type="text" id="cid-value" class="form-input" placeholder="${escapeHtml(COMPANY_ID_PLACEHOLDERS.COMPANY_REG)}">
          <div class="form-help" id="cid-help">${escapeHtml(COMPANY_ID_HELP.COMPANY_REG)}</div>
          <div class="field-error" id="err-cid-value"></div>
        </div>
        <div class="oorg-add-member-actions">
          <button class="btn btn-primary btn-sm" id="btn-submit-cid">Add</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-cid">Cancel</button>
        </div>
      </div>` : "";

    const table = companyIds.length === 0
        ? '<p class="oorg-empty-section">No company IDs registered</p>'
        : `<table>
          <thead><tr><th>Type</th><th>Country</th><th>Value</th><th>Status${infoIcon("oorgd-cid-verif", INFO_VERIFICATION_LEVEL)}</th>${isAdmin ? "<th>Actions</th>" : ""}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

    return `
    <div class="card">
      <div class="oorg-members-header">
        <div class="card-title">Company IDs (${companyIds.length})${infoIcon("oorgd-cid-types", INFO_COMPANY_ID_TYPES)}</div>
        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="btn-add-cid">+ Add ID</button>' : ""}
      </div>
      ${addForm}
      ${table}
    </div>`;
}

function renderContactIdentitiesCard(
    contacts: { contact_id: string; type: string; value: string; verified: boolean }[],
    isAdmin: boolean,
): string {
    const rows = contacts.map((c, i) => `<tr>
      <td>${escapeHtml(c.type === "EMAIL" ? "Email" : c.type === "PHONE" ? "Phone" : c.type)}</td>
      <td class="mono">${escapeHtml(c.value)}</td>
      <td>${c.verified ? '<span class="badge badge-green">VERIFIED</span>' : '<span class="badge badge-muted">UNVERIFIED</span>'}</td>
      ${isAdmin ? `<td><button class="btn btn-secondary profile-btn-remove oorg-btn-remove-contact" data-index="${i}">Remove</button></td>` : ""}
    </tr>`).join("\n");

    const addForm = isAdmin ? `
      <div id="add-contact-form" class="hidden oorg-add-member-form">
        <div class="form-group">
          <label class="form-label" for="contact-type">Type</label>
          <select id="contact-type" class="form-select">
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="contact-value">Value</label>
          <input type="text" id="contact-value" class="form-input" placeholder="e.g. org@example.com">
          <div class="field-error" id="err-contact-value"></div>
        </div>
        <div class="oorg-add-member-actions">
          <button class="btn btn-primary btn-sm" id="btn-submit-contact">Add</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-contact">Cancel</button>
        </div>
      </div>` : "";

    return `
    <div class="card">
      <div class="oorg-members-header">
        <div class="card-title">Contact Identities (${contacts.length})</div>
        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="btn-add-contact">+ Add Contact</button>' : ""}
      </div>
      ${addForm}
      ${contacts.length === 0
        ? '<p class="oorg-empty-section">No contact identities</p>'
        : `<table>
          <thead><tr><th>Type</th><th>Value</th><th>Status</th>${isAdmin ? "<th>Actions</th>" : ""}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    </div>`;
}

function domainVerificationBadge(level?: string): string {
    if (!level || level === "UNVERIFIED")
        return '<span class="badge badge-muted">UNVERIFIED</span>';
    if (level === "FORMAT_VALID") return '<span class="badge badge-amber">FORMAT VALID</span>';
    if (level === "VERIFIED") return '<span class="badge badge-green">VERIFIED</span>';
    return `<span class="badge badge-muted">${escapeHtml(level)}</span>`;
}

function renderDomainsCard(
    domains: { domain_id: string; domain: string; verification_level: string }[],
    isAdmin: boolean,
): string {
    const rows = domains.map((d, i) => `<tr>
      <td class="mono">${escapeHtml(d.domain)}</td>
      <td>${domainVerificationBadge(d.verification_level)}</td>
      ${isAdmin ? `<td><button class="btn btn-secondary profile-btn-remove oorg-btn-remove-domain" data-index="${i}">Remove</button></td>` : ""}
    </tr>`).join("\n");

    const addForm = isAdmin ? `
      <div id="add-domain-form" class="hidden oorg-add-member-form">
        <div class="form-group">
          <label class="form-label" for="domain-value">Domain Name</label>
          <input type="text" id="domain-value" class="form-input" placeholder="e.g. example.com">
          <div class="form-help">The domain name owned by this organization. Verification can be done later.</div>
          <div class="field-error" id="err-domain-value"></div>
        </div>
        <div class="oorg-add-member-actions">
          <button class="btn btn-primary btn-sm" id="btn-submit-domain">Add</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-domain">Cancel</button>
        </div>
      </div>` : "";

    return `
    <div class="card">
      <div class="oorg-members-header">
        <div class="card-title">Domains (${domains.length})</div>
        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="btn-add-domain">+ Add Domain</button>' : ""}
      </div>
      ${addForm}
      ${domains.length === 0
        ? '<p class="oorg-empty-section">No domains registered</p>'
        : `<table>
          <thead><tr><th>Domain</th><th>Status</th>${isAdmin ? "<th>Actions</th>" : ""}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    </div>`;
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
        <h2 id="org-display-name">${escapeHtml(org.display_name || "Organization")}</h2>
        ${isAdmin ? '<button class="btn btn-secondary btn-sm" id="btn-rename-org" title="Rename"><span class="material-symbols-outlined" style="font-size:16px">edit</span></button>' : ""}
        ${statusBadge(org.status)}${infoIcon("oorgd-status", INFO_ORG_STATUS)}
        ${verificationBadge(org.verification_status)}${infoIcon("oorgd-verif", INFO_ORG_VERIFICATION)}
      </div>
      ${isAdmin ? `
      <div id="rename-form" class="hidden oorg-rename-form">
        <input type="text" id="rename-input" class="form-input" value="${escapeHtml(org.display_name || "")}">
        <button class="btn btn-primary btn-sm" id="btn-save-rename">Save</button>
        <button class="btn btn-secondary btn-sm" id="btn-cancel-rename">Cancel</button>
      </div>` : ""}
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
        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="btn-add-member">+ Invite Member</button>' : ""}
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

    ${(() => {
        const invites = data.pendingInvites ?? [];
        if (!isAdmin || invites.length === 0) return "";
        const inviteRows = invites.map((inv) => `<tr>
          <td>${escapeHtml(inv.display_name || "—")}</td>
          <td>${copyableId(inv.user_principal_id)}</td>
          <td>${roleBadge(inv.role)}</td>
          <td class="mono">${formatTimestamp(inv.created_at)}</td>
          <td class="mono">${formatTimestamp(inv.expires_at)}</td>
          <td>
            <button class="btn btn-secondary btn-sm oorg-btn-cancel-invite" data-invite-id="${escapeHtml(inv.invite_id)}" data-user-name="${escapeHtml(inv.display_name || inv.user_principal_id.slice(0, 8))}">Cancel</button>
          </td>
        </tr>`).join("");
        return `
    <div class="card oorg-invites-card">
      <div class="card-title">Pending Invitations (${invites.length})</div>
      <table>
        <thead><tr><th>Name</th><th>User ID</th><th>Role</th><th>Sent</th><th>Expires</th><th>Actions</th></tr></thead>
        <tbody>${inviteRows}</tbody>
      </table>
    </div>`;
    })()}

    ${renderContactIdentitiesCard(org.contact_identities ?? [], isAdmin)}

    ${renderDomainsCard(org.domains ?? [], isAdmin)}

    ${renderCompanyIdsCard(org.company_ids ?? [], isAdmin)}

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

    <script>window.__PAGE_DATA__ = { orgId: '${escapeHtml(org.org_id)}', role: '${escapeHtml(org.role)}', companyIds: ${JSON.stringify(org.company_ids ?? [])}, contactIdentities: ${JSON.stringify(org.contact_identities ?? [])}, domains: ${JSON.stringify(org.domains ?? [])}, companyRegInfo: ${JSON.stringify(COMPANY_REG_INFO)} };</script>
    ${assetTags("pages/owner-organizations/client.ts")}`;

    return renderPage(org.display_name || "Organization", content, "/gui/organizations", "owner", renderPageOptions);
}
