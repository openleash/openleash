import {
    renderPage,
    escapeHtml,
    formatNameWithId,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_OWNER_STATUS,
    INFO_AGENT_STATUS,
    INFO_VERIFICATION_LEVEL,
} from "../layout.js";

// ─── Country data ─────────────────────────────────────────────────────

const EU_COUNTRY_NAMES: Record<string, string> = {
    AT: "Austria",
    BE: "Belgium",
    BG: "Bulgaria",
    HR: "Croatia",
    CY: "Cyprus",
    CZ: "Czech Republic",
    DK: "Denmark",
    EE: "Estonia",
    FI: "Finland",
    FR: "France",
    DE: "Germany",
    GR: "Greece",
    HU: "Hungary",
    IE: "Ireland",
    IT: "Italy",
    LV: "Latvia",
    LT: "Lithuania",
    LU: "Luxembourg",
    MT: "Malta",
    NL: "Netherlands",
    PL: "Poland",
    PT: "Portugal",
    RO: "Romania",
    SK: "Slovakia",
    SI: "Slovenia",
    ES: "Spain",
    SE: "Sweden",
};

function countryFlag(code: string): string {
    return String.fromCodePoint(
        ...code
            .toUpperCase()
            .split("")
            .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
}

// Human-readable labels for government ID types
const GOV_ID_LABELS: Record<string, string> = {
    PERSONNUMMER: "Personnummer",
    BSN: "BSN (Burgerservicenummer)",
    RIJKSREGISTERNUMMER: "Rijksregisternummer",
    PESEL: "PESEL",
    HENKILOTUNNUS: "Henkilötunnus",
    DNI: "DNI",
    NIE: "NIE (Foreigners)",
    CODICE_FISCALE: "Codice Fiscale",
    STEUER_ID: "Steuer-ID",
    NIR: "NIR (Sécurité sociale)",
    OIB: "OIB",
    EGN: "EGN",
    RODNE_CISLO: "Rodné číslo",
    CPR: "CPR-nummer",
    ISIKUKOOD: "Isikukood",
    AMKA: "AMKA",
    PPSN: "PPS Number",
    ASMENS_KODAS: "Asmens kodas",
    NIF: "NIF",
    CNP: "CNP",
    EMSO: "EMŠO",
    ZMR: "ZMR-Zahl",
    ARC: "ARC Number",
    SZEMELYI_SZAM: "Személyi szám",
    ADOAZONOSITO: "Adóazonosító jel",
    PERSONAS_KODS: "Personas kods",
    MATRICULE: "Matricule",
    ID_CARD: "ID Card Number",
};

// ─── Interfaces ───────────────────────────────────────────────────────

export interface OwnerData {
    owner_principal_id: string;
    principal_type?: string;
    display_name?: string;
    status?: string;
    attributes?: Record<string, unknown>;
    created_at?: string;
    error?: string;
    identity_assurance_level?: string;
    contact_identities?: {
        contact_id: string;
        type: string;
        value: string;
        label?: string;
        platform?: string;
        verified: boolean;
        verified_at: string | null;
        added_at: string;
    }[];
    government_ids?: {
        country: string;
        id_type: string;
        id_value: string;
        verification_level: string;
        verified_at: string | null;
        added_at: string;
    }[];
    company_ids?: {
        id_type: string;
        country?: string;
        id_value: string;
        verification_level: string;
        verified_at: string | null;
        added_at: string;
    }[];
    signatories?: {
        signatory_id: string;
        human_owner_principal_id: string;
        role: string;
        signing_authority: string;
        scope_description?: string;
        valid_from?: string;
        valid_until: string | null;
        added_at: string;
    }[];
    signatory_rules?: {
        rule_id: string;
        description: string;
        required_signatories: number;
        from_roles?: string[];
        scope_description?: string;
        conditions?: Record<string, unknown>;
    }[];
    totp_enabled?: boolean;
    totp_enabled_at?: string;
    has_passphrase?: boolean;
}

export interface OwnerDetailData {
    owner: OwnerData;
    agents: { agent_id: string; agent_principal_id: string; status: string; created_at: string }[];
    policies: { policy_id: string; applies_to_agent_principal_id: string | null }[];
    audit: {
        event_id: string;
        timestamp: string;
        event_type: string;
        metadata_json: Record<string, unknown>;
    }[];
    linked_humans?: { owner_principal_id: string; display_name: string }[];
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

function verificationBadge(level?: string): string {
    if (!level || level === "UNVERIFIED")
        return '<span class="badge badge-muted">UNVERIFIED</span>';
    if (level === "FORMAT_VALID") return '<span class="badge badge-amber">FORMAT VALID</span>';
    if (level === "VERIFIED") return '<span class="badge badge-green">VERIFIED</span>';
    return `<span class="badge badge-muted">${escapeHtml(level)}</span>`;
}

function assuranceBadge(level?: string): string {
    if (!level || level === "NONE") return '<span class="badge badge-muted">NONE</span>';
    if (level === "SELF_DECLARED") return '<span class="badge badge-muted">SELF-DECLARED</span>';
    if (level === "CONTACT_VERIFIED")
        return '<span class="badge badge-amber">CONTACT VERIFIED</span>';
    if (level === "ID_FORMAT_VALID")
        return '<span class="badge badge-amber">ID FORMAT VALID</span>';
    if (level === "ID_VERIFIED") return '<span class="badge badge-green">ID VERIFIED</span>';
    return `<span class="badge badge-muted">${escapeHtml(level)}</span>`;
}

function contactTypeLabel(type: string): string {
    switch (type) {
        case "EMAIL":
            return "Email";
        case "PHONE":
            return "Phone";
        case "INSTANT_MESSAGE":
            return "IM";
        case "SOCIAL_MEDIA":
            return "Social";
        default:
            return type;
    }
}

// ─── Owners List Page ─────────────────────────────────────────────────

export function renderOwners(owners: OwnerData[]): string {
    const rows = owners
        .map(
            (o) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(o.owner_principal_id)}">
        <a href="/gui/owners/${escapeHtml(o.owner_principal_id)}" class="table-link">${escapeHtml(o.owner_principal_id.slice(0, 8))}...</a>
      </td>
      <td>${escapeHtml(o.display_name ?? "-")}</td>
      <td>${escapeHtml(o.principal_type ?? "-")}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="mono">${o.created_at ? formatTimestamp(o.created_at, true) : "-"}</td>
      <td>
        <a href="/gui/owners/${escapeHtml(o.owner_principal_id)}" class="btn btn-secondary" style="padding:4px 10px;font-size:12px">View</a>
      </td>
    </tr>
  `,
        )
        .join("");

    const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>Owners</h2>
        <p>${owners.length} registered owner${owners.length !== 1 ? "s" : ""}</p>
      </div>
      <button class="btn btn-primary" onclick="toggleForm()">+ Add Owner</button>
    </div>

    <div id="owner-form" class="card hidden">
      <div class="card-title">Add New Owner</div>

      <div class="form-group">
        <label for="display-name">Display Name</label>
        <input type="text" id="display-name" class="form-input" placeholder="e.g. Alice Johnson">
        <div class="field-error" id="err-display-name"></div>
      </div>

      <div class="form-group">
        <label for="principal-type">Principal Type</label>
        <select id="principal-type" class="form-select">
          <option value="HUMAN">HUMAN</option>
          <option value="ORG">ORG</option>
        </select>
        <div class="form-help">HUMAN for individual users, ORG for organizations</div>
      </div>

      <div class="toolbar">
        <button id="create-btn" class="btn btn-primary" onclick="createOwner()">Create Owner</button>
        <button class="btn btn-secondary" onclick="toggleForm()">Cancel</button>
      </div>
    </div>

    <div class="card">
      <table>
        <colgroup><col style="width:290px"><col><col style="width:100px"><col style="width:130px"><col style="width:170px"><col style="width:140px"></colgroup>
        <thead>
          <tr>
            <th>Principal ID</th>
            <th>Display Name</th>
            <th>Type</th>
            <th>Status${infoIcon("owners-status", INFO_OWNER_STATUS)}</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">No owners registered</td></tr>'}
        </tbody>
      </table>
    </div>

    <script>
      function toggleForm() {
        document.getElementById('owner-form').classList.toggle('hidden');
      }

      async function createOwner() {
        const displayName = document.getElementById('display-name').value.trim();
        const principalType = document.getElementById('principal-type').value;
        const btn = document.getElementById('create-btn');

        olFieldError('display-name', '');
        if (!displayName) {
          olFieldError('display-name', 'Display name is required');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
          const res = await fetch('/v1/admin/owners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              principal_type: principalType,
              display_name: displayName,
            }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || 'Failed to create owner');
          }

          const result = await res.json();
          olToast('Owner created (ID: ' + result.owner_principal_id.slice(0, 8) + '...)', 'success');
          setTimeout(() => { window.location.reload(); }, 1000);
        } catch (err) {
          olToast(String(err.message || err), 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Create Owner';
        }
      }
    </script>
  `;

    return renderPage("Owners", content, "/gui/owners");
}

// ─── Contact Identities Card (read-only) ─────────────────────────────

function renderContactIdentitiesCard(owner: OwnerData): string {
    const contacts = owner.contact_identities ?? [];
    const rows = contacts
        .map(
            (c) => `
    <tr>
      <td>${escapeHtml(contactTypeLabel(c.type))}</td>
      <td class="mono">${escapeHtml(c.value)}</td>
      <td>${escapeHtml(c.label ?? "-")}</td>
      <td>${escapeHtml(c.platform ?? "-")}</td>
      <td>${c.verified ? '<span class="badge badge-green">VERIFIED</span>' : '<span class="badge badge-muted">UNVERIFIED</span>'}</td>
    </tr>
  `,
        )
        .join("");

    return `
    <div class="card">
      <div class="card-title">Contact Identities (${contacts.length})</div>
      ${
          contacts.length > 0
              ? `
      <table>
        <colgroup><col style="width:140px"><col><col style="width:120px"><col style="width:120px"><col style="width:130px"></colgroup>
        <thead>
          <tr><th>Type</th><th>Value</th><th>Label</th><th>Platform</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px">No contact identities</p>'
      }
    </div>
  `;
}

// ─── Government IDs Card (read-only) ─────────────────────────────────

function renderGovernmentIdsCard(owner: OwnerData): string {
    const ids = owner.government_ids ?? [];
    const rows = ids
        .map(
            (g) => `
    <tr>
      <td>${countryFlag(g.country)} ${escapeHtml(g.country)} ${escapeHtml(EU_COUNTRY_NAMES[g.country] ?? "")}</td>
      <td>${escapeHtml(GOV_ID_LABELS[g.id_type] ?? g.id_type.replace(/_/g, " "))}</td>
      <td class="mono">${escapeHtml(g.id_value)}</td>
      <td>${verificationBadge(g.verification_level)}</td>
    </tr>
  `,
        )
        .join("");

    return `
    <div class="card">
      <div class="card-title">Government IDs (${ids.length})${infoIcon("admin-gov-verification", INFO_VERIFICATION_LEVEL)}</div>
      ${
          ids.length > 0
              ? `
      <table>
        <colgroup><col style="width:160px"><col style="width:180px"><col><col style="width:130px"></colgroup>
        <thead>
          <tr><th>Country</th><th>ID Type</th><th>Value</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px">No government IDs</p>'
      }
    </div>
  `;
}

// ─── Company IDs Card (read-only) ────────────────────────────────────

function renderCompanyIdsCard(owner: OwnerData): string {
    const ids = owner.company_ids ?? [];
    const rows = ids
        .map(
            (c) => `
    <tr>
      <td>${escapeHtml(c.id_type)}</td>
      <td>${c.country ? `${countryFlag(c.country)} ${escapeHtml(c.country)}` : "-"}</td>
      <td class="mono">${escapeHtml(c.id_value)}</td>
      <td>${verificationBadge(c.verification_level)}</td>
    </tr>
  `,
        )
        .join("");

    return `
    <div class="card">
      <div class="card-title">Company IDs (${ids.length})${infoIcon("admin-company-verification", INFO_VERIFICATION_LEVEL)}</div>
      ${
          ids.length > 0
              ? `
      <table>
        <colgroup><col style="width:180px"><col style="width:160px"><col><col style="width:130px"></colgroup>
        <thead>
          <tr><th>Type</th><th>Country</th><th>Value</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px">No company IDs</p>'
      }
    </div>
  `;
}

// ─── Signatories Card (read-only) ────────────────────────────────────

function renderSignatoriesCard(
    owner: OwnerData,
    linkedHumans: { owner_principal_id: string; display_name: string }[],
): string {
    const signatories = owner.signatories ?? [];
    const humanMap = new Map(linkedHumans.map((h) => [h.owner_principal_id, h.display_name]));
    const rows = signatories
        .map((s) => {
            const name =
                humanMap.get(s.human_owner_principal_id) ??
                s.human_owner_principal_id.slice(0, 8) + "...";
            return `
    <tr>
      <td><a href="/gui/owners/${escapeHtml(s.human_owner_principal_id)}" class="table-link">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(s.role.replace(/_/g, " "))}</td>
      <td>${escapeHtml(s.signing_authority)}</td>
      <td>${escapeHtml(s.scope_description ?? "-")}</td>
    </tr>
    `;
        })
        .join("");

    return `
    <div class="card">
      <div class="card-title">Signatories (${signatories.length})</div>
      ${
          signatories.length > 0
              ? `
      <table>
        <colgroup><col><col style="width:140px"><col style="width:140px"><col></colgroup>
        <thead>
          <tr><th>Person</th><th>Role</th><th>Authority</th><th>Scope</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px">No signatories</p>'
      }
    </div>
  `;
}

// ─── Signatory Rules Card (read-only) ────────────────────────────────

function renderSignatoryRulesCard(owner: OwnerData): string {
    const rules = owner.signatory_rules ?? [];
    const rows = rules
        .map(
            (r) => `
    <tr>
      <td>${escapeHtml(r.description)}</td>
      <td>${r.required_signatories}</td>
      <td>${escapeHtml((r.from_roles ?? []).join(", ") || "Any")}</td>
      <td>${escapeHtml(r.scope_description ?? "-")}</td>
    </tr>
  `,
        )
        .join("");

    return `
    <div class="card">
      <div class="card-title">Signatory Rules (${rules.length})</div>
      ${
          rules.length > 0
              ? `
      <table>
        <colgroup><col><col style="width:100px"><col style="width:140px"><col></colgroup>
        <thead>
          <tr><th>Description</th><th>Required</th><th>Roles</th><th>Scope</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px">No signatory rules</p>'
      }
    </div>
  `;
}

// ─── Owner Detail Page ────────────────────────────────────────────────

export function renderOwnerDetail(data: OwnerDetailData): string {
    const { owner, agents, policies, audit, linked_humans } = data;

    const agentRows = agents
        .map(
            (a) => `
    <tr>
      <td>${copyableId(a.agent_id, a.agent_id.length)}</td>
      <td>${copyableId(a.agent_principal_id)}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${formatTimestamp(a.created_at, true)}</td>
    </tr>
  `,
        )
        .join("");

    const agentMap = new Map(agents.map((a) => [a.agent_principal_id, a.agent_id]));

    const policyRows = policies
        .map(
            (p) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(p.policy_id)}">
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.policy_id.slice(0, 8))}...</a>
      </td>
      <td>${p.applies_to_agent_principal_id ? formatNameWithId(agentMap.get(p.applies_to_agent_principal_id), p.applies_to_agent_principal_id) : '<span style="color:var(--text-muted)">all agents</span>'}</td>
    </tr>
  `,
        )
        .join("");

    const auditRows = audit
        .map(
            (e, i) => `
    <tr class="accordion-row" onclick="toggleAccordion(${i})" id="row-${i}">
      <td style="width:20px"><span class="chevron material-symbols-outlined">chevron_right</span></td>
      <td class="mono" style="white-space:nowrap">${escapeHtml(e.timestamp.slice(0, 19).replace("T", " "))}</td>
      <td>${eventBadge(e.event_type)}</td>
    </tr>
    <tr class="accordion-detail" id="detail-${i}">
      <td colspan="3">
        <div class="accordion-content">${
            Object.entries(e.metadata_json)
                .map(
                    ([k, v]) =>
                        `<div style="margin-bottom:6px"><span style="color:var(--green-bright)">${escapeHtml(k)}</span>: <span style="color:var(--text-primary)">${escapeHtml(typeof v === "object" ? JSON.stringify(v, null, 2) : String(v))}</span></div>`,
                )
                .join("") || '<span style="color:var(--text-muted)">No metadata</span>'
        }</div>
      </td>
    </tr>
  `,
        )
        .join("");

    const attrEntries = Object.entries(owner.attributes ?? {});
    const attrHtml =
        attrEntries.length > 0
            ? attrEntries
                  .map(
                      ([k, v]) => `
      <tr>
        <td style="width:160px;color:var(--text-muted)">${escapeHtml(k)}</td>
        <td class="mono">${escapeHtml(typeof v === "object" ? JSON.stringify(v) : String(v))}</td>
      </tr>
    `,
                  )
                  .join("")
            : '<tr><td colspan="2" style="color:var(--text-muted)">No custom attributes</td></tr>';

    const content = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
        <h2>${escapeHtml(owner.display_name ?? "Owner")}</h2>
        ${statusBadge(owner.status)}${infoIcon("detail-owner-status", INFO_OWNER_STATUS)}
        ${assuranceBadge(owner.identity_assurance_level)}
      </div>
      <p>${copyableId(owner.owner_principal_id, owner.owner_principal_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr>
            <td style="color:var(--text-muted)">Principal ID</td>
            <td>${copyableId(owner.owner_principal_id, owner.owner_principal_id.length)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Display Name</td>
            <td>${escapeHtml(owner.display_name ?? "-")}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Type</td>
            <td>${escapeHtml(owner.principal_type ?? "-")}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Status</td>
            <td>${statusBadge(owner.status)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Created</td>
            <td class="mono">${owner.created_at ? formatTimestamp(owner.created_at) : "-"}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">${owner.has_passphrase ? "Reset Passphrase" : "Setup Invite"}</div>
        ${owner.has_passphrase ? '<span class="badge badge-green" style="font-size:11px">Setup complete</span>' : '<span class="badge badge-amber" style="font-size:11px">Setup pending</span>'}
      </div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">
        ${
            owner.has_passphrase
                ? "Generate a one-time link to let this owner reset their passphrase."
                : "Generate a one-time setup invite link for this owner to set up their account (passphrase, contact info, IDs)."
        }
      </p>
      <button id="invite-btn" class="btn ${owner.has_passphrase ? "btn-secondary" : "btn-primary"}" style="padding:6px 14px;font-size:12px" onclick="generateInvite()">${owner.has_passphrase ? "Generate Reset Link" : "Generate Setup Invite"}</button>
      <div id="invite-result" class="hidden" style="margin-top:12px">
        <div class="card-title" style="font-size:12px">${owner.has_passphrase ? "Reset Link" : "Setup Link"} (copy and share securely — shown once)</div>
        <div style="display:flex;gap:8px;align-items:stretch">
          <pre id="invite-link" class="config-block" style="word-break:break-all;white-space:pre-wrap;margin-bottom:0;flex:1"></pre>
          <button type="button" id="copy-btn" onclick="copyLink()" class="btn btn-secondary" style="padding:6px 12px;font-size:11px;white-space:nowrap;align-self:start">Copy</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Security</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr>
            <td style="color:var(--text-muted)">Two-Factor Auth</td>
            <td>
              ${
                  owner.totp_enabled
                      ? `<span class="badge badge-green">Enabled</span>${owner.totp_enabled_at ? ` <span style="font-size:12px;color:var(--text-muted)">since ${formatTimestamp(owner.totp_enabled_at)}</span>` : ""}`
                      : '<span class="badge badge-muted">Not configured</span>'
              }
            </td>
          </tr>
        </tbody>
      </table>
      ${
          owner.totp_enabled
              ? `
      <div style="margin-top:12px">
        <button class="btn btn-secondary" style="border-color:var(--color-danger);color:var(--color-danger);font-size:12px;padding:4px 12px" onclick="adminDisableTotp()">Disable 2FA</button>
      </div>
      `
              : ""
      }
    </div>

    ${
        attrEntries.length > 0
            ? `
    <div class="card">
      <div class="card-title">Attributes</div>
      <table><colgroup><col style="width:160px"><col></colgroup><tbody>${attrHtml}</tbody></table>
    </div>
    `
            : ""
    }

    ${renderContactIdentitiesCard(owner)}
    ${owner.principal_type === "HUMAN" ? renderGovernmentIdsCard(owner) : ""}
    ${owner.principal_type === "ORG" ? renderCompanyIdsCard(owner) : ""}
    ${owner.principal_type === "ORG" ? renderSignatoriesCard(owner, linked_humans ?? []) : ""}
    ${owner.principal_type === "ORG" ? renderSignatoryRulesCard(owner) : ""}

    <div class="card">
      <div class="card-title">Agents (${agents.length})</div>
      <table>
        <colgroup><col><col style="width:290px"><col style="width:130px"><col style="width:170px"></colgroup>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Principal ID</th>
            <th>Status${infoIcon("detail-agent-status", INFO_AGENT_STATUS)}</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${agentRows || '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:16px">No agents registered under this owner</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Policies (${policies.length})</div>
      <table>
        <colgroup><col style="width:290px"><col></colgroup>
        <thead>
          <tr>
            <th>Policy ID</th>
            <th>Applies To</th>
          </tr>
        </thead>
        <tbody>
          ${policyRows || '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;padding:16px">No policies for this owner</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Activity Log</div>
      ${
          audit.length > 0
              ? `
      <table>
        <colgroup><col style="width:36px"><col style="width:170px"><col></colgroup>
        <thead>
          <tr>
            <th></th>
            <th>Timestamp</th>
            <th>Event</th>
          </tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);padding:8px 0">No activity recorded for this owner</p>'
      }
    </div>

    <div class="toolbar">
      <a href="/gui/owners" class="btn btn-secondary">Back to Owners</a>
    </div>

    <script>
      var ownerId = '${escapeHtml(owner.owner_principal_id)}';

      function toggleAccordion(idx) {
        var row = document.getElementById('row-' + idx);
        var detail = document.getElementById('detail-' + idx);
        var isOpen = detail.classList.contains('open');
        if (isOpen) {
          detail.classList.remove('open');
          row.classList.remove('expanded');
        } else {
          detail.classList.add('open');
          row.classList.add('expanded');
        }
      }

      function copyLink() {
        var linkText = document.getElementById('invite-link').textContent;
        navigator.clipboard.writeText(linkText).then(function() {
          var btn = document.getElementById('copy-btn');
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
        });
      }

      async function adminDisableTotp() {
        if (!await olConfirm('Are you sure you want to disable 2FA for this owner? They will need to set it up again.', 'Disable 2FA')) return;
        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/disable-totp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          if (res.ok) {
            window.location.reload();
          } else {
            var err = await res.json();
            olToast((err.error && err.error.message) || 'Failed to disable 2FA', 'error');
          }
        } catch (e) {
          olToast('Network error', 'error');
        }
      }

      async function generateInvite() {
        var btn = document.getElementById('invite-btn');
        btn.disabled = true;
        btn.textContent = 'Generating...';

        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/setup-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });

          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to generate invite');
          }

          var data = await res.json();
          var resultDiv = document.getElementById('invite-result');
          resultDiv.classList.remove('hidden');
          var setupUrl = window.location.origin + '/gui/owner/setup?invite_id=' + encodeURIComponent(data.invite_id) + '&invite_token=' + encodeURIComponent(data.invite_token) + '&owner_id=' + encodeURIComponent(ownerId);
          document.getElementById('invite-link').textContent = setupUrl;
          btn.style.display = 'none';
        } catch (err) {
          olToast(String(err.message || err), 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Generate Setup Invite';
        }
      }
    </script>
  `;

    return renderPage(owner.display_name ?? "Owner", content, "/gui/owners");
}
