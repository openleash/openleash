import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_OWNER_STATUS,
    INFO_VERIFICATION_LEVEL,
} from "../layout.js";
import { assetTags } from "../manifest.js";

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

const EU_PERSONAL_ID_TYPES: Record<string, string[]> = {
    AT: ["ZMR"],
    BE: ["RIJKSREGISTERNUMMER"],
    BG: ["EGN"],
    HR: ["OIB"],
    CY: ["ARC"],
    CZ: ["RODNE_CISLO"],
    DK: ["CPR"],
    EE: ["ISIKUKOOD"],
    FI: ["HENKILOTUNNUS"],
    FR: ["NIR"],
    DE: ["STEUER_ID"],
    GR: ["AMKA"],
    HU: ["SZEMELYI_SZAM", "ADOAZONOSITO"],
    IE: ["PPSN"],
    IT: ["CODICE_FISCALE"],
    LV: ["PERSONAS_KODS"],
    LT: ["ASMENS_KODAS"],
    LU: ["MATRICULE"],
    MT: ["ID_CARD"],
    NL: ["BSN"],
    PL: ["PESEL"],
    PT: ["NIF"],
    RO: ["CNP"],
    SK: ["RODNE_CISLO"],
    SI: ["EMSO"],
    ES: ["DNI", "NIE"],
    SE: ["PERSONNUMMER"],
};

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

function countryFlag(code: string): string {
    return String.fromCodePoint(
        ...code
            .toUpperCase()
            .split("")
            .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    );
}

// ─── Interfaces ───────────────────────────────────────────────────────

export interface OwnerProfileData {
    owner_principal_id: string;
    principal_type: string;
    display_name: string;
    status: string;
    identity_assurance_level?: string;
    contact_identities?: Array<{
        contact_id: string;
        type: string;
        value: string;
        label?: string;
        platform?: string;
        verified: boolean;
        verified_at: string | null;
        added_at: string;
    }>;
    government_ids?: Array<{
        country: string;
        id_type: string;
        id_value: string;
        verification_level: string;
        verified_at: string | null;
        added_at: string;
    }>;
    company_ids?: Array<{
        id_type: string;
        country?: string;
        id_value: string;
        verification_level: string;
        verified_at: string | null;
        added_at: string;
    }>;
    created_at: string;
    totp_enabled?: boolean;
    totp_enabled_at?: string;
    totp_backup_codes_remaining?: number;
}

// ─── Render ───────────────────────────────────────────────────────────

export function renderOwnerProfile(data: OwnerProfileData): string {
    const contacts = data.contact_identities ?? [];
    const govIds = data.government_ids ?? [];
    const companyIds = data.company_ids ?? [];
    const isHuman = data.principal_type === "HUMAN";
    const isOrg = data.principal_type === "ORG";

    const contactRows = contacts
        .map(
            (c, i) => `
    <tr>
      <td><span class="badge badge-muted">${escapeHtml(c.type)}</span></td>
      <td>${escapeHtml(c.value)}</td>
      <td>${escapeHtml(c.label ?? "-")}</td>
      <td>${escapeHtml(c.platform ?? "-")}</td>
      <td>${c.verified ? '<span class="badge badge-green">Verified</span>' : '<span class="badge badge-muted">Unverified</span>'}</td>
      <td><button class="btn btn-secondary" style="padding:3px 8px;font-size:11px" data-action="remove-contact" data-index="${i}">Remove</button></td>
    </tr>
  `,
        )
        .join("");

    const govIdRows = govIds
        .map(
            (g, i) => `
    <tr>
      <td>${countryFlag(g.country)} ${escapeHtml(g.country)} ${escapeHtml(EU_COUNTRY_NAMES[g.country] ?? "")}</td>
      <td>${escapeHtml(GOV_ID_LABELS[g.id_type] ?? g.id_type)}</td>
      <td class="mono">${escapeHtml(g.id_value)}</td>
      <td>${verificationBadge(g.verification_level)}</td>
      <td><button class="btn btn-secondary" style="padding:3px 8px;font-size:11px" data-action="remove-gov-id" data-index="${i}">Remove</button></td>
    </tr>
  `,
        )
        .join("");

    const companyIdRows = companyIds
        .map(
            (c, i) => `
    <tr>
      <td>${escapeHtml(c.id_type)}</td>
      <td>${c.country ? countryFlag(c.country) + " " + escapeHtml(c.country) : "-"}</td>
      <td class="mono">${escapeHtml(c.id_value)}</td>
      <td>${verificationBadge(c.verification_level)}</td>
      <td><button class="btn btn-secondary" style="padding:3px 8px;font-size:11px" data-action="remove-company-id" data-index="${i}">Remove</button></td>
    </tr>
  `,
        )
        .join("");

    // Build country options for gov ID form
    const countryOptions = Object.entries(EU_COUNTRY_NAMES)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(
            ([code, name]) =>
                `<option value="${code}">${countryFlag(code)} ${escapeHtml(name)}</option>`,
        )
        .join("");

    // Build EU_PERSONAL_ID_TYPES as JSON for JS
    const idTypesJson = JSON.stringify(EU_PERSONAL_ID_TYPES);
    const idLabelsJson = JSON.stringify(GOV_ID_LABELS);

    const content = `
    <div class="page-header">
      <h2>Profile</h2>
    </div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr><td style="color:var(--text-muted)">Principal ID</td><td>${copyableId(data.owner_principal_id, data.owner_principal_id.length)}</td></tr>
          <tr><td style="color:var(--text-muted)">Display Name</td><td>
            <span id="display-name-view" style="display:flex;align-items:center;gap:8px">
              <span>${escapeHtml(data.display_name)}</span>
              <button class="btn btn-secondary" style="padding:2px 8px;font-size:11px" id="btn-show-name-edit">Edit</button>
            </span>
            <span id="display-name-edit" style="display:none;align-items:center;gap:8px;flex-wrap:wrap">
              <input type="text" id="newDisplayName" value="${escapeHtml(data.display_name)}" class="form-input" style="width:220px;padding:4px 8px;font-size:13px">
              <button class="btn btn-primary" style="padding:4px 12px;font-size:12px" id="btn-update-name">Save</button>
              <button class="btn btn-secondary" style="padding:4px 12px;font-size:12px" id="btn-hide-name-edit">Cancel</button>
              <div class="field-error" id="err-newDisplayName" style="width:100%"></div>
            </span>
          </td></tr>
          <tr><td style="color:var(--text-muted)">Type</td><td>${escapeHtml(data.principal_type)}</td></tr>
          <tr><td style="color:var(--text-muted)">Status</td><td><span class="badge ${data.status === "ACTIVE" ? "badge-green" : "badge-red"}">${escapeHtml(data.status)}</span>${infoIcon("owner-status", INFO_OWNER_STATUS)}</td></tr>
          <tr><td style="color:var(--text-muted)">Assurance Level</td><td>${assuranceLevelDisplay(data.identity_assurance_level)}${infoIcon("assurance-level", ASSURANCE_LEVEL_POPOVER)}</td></tr>
          <tr><td style="color:var(--text-muted)">Created</td><td class="mono">${formatTimestamp(data.created_at)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Security${infoIcon("security-2fa", SECURITY_2FA_POPOVER)}</div>
      ${
          data.totp_enabled
              ? `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span class="badge badge-green">2FA Enabled</span>
        ${data.totp_enabled_at ? `<span style="font-size:12px;color:var(--text-muted)">since ${formatTimestamp(data.totp_enabled_at)}</span>` : ""}
      </div>
      ${data.totp_backup_codes_remaining !== undefined ? `<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${data.totp_backup_codes_remaining} backup code${data.totp_backup_codes_remaining !== 1 ? "s" : ""} remaining</p>` : ""}
      <button class="btn btn-secondary" style="border-color:var(--color-danger);color:var(--color-danger)" id="btn-open-disable-modal">Disable 2FA</button>
      `
              : `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Two-Factor Authentication: Not configured</p>
      <button class="btn btn-primary" id="btn-setup-totp">Enable 2FA</button>
      `
      }
    </div>

    <!-- TOTP Setup Modal -->
    <div id="totp-setup-modal" class="modal-overlay" data-close-modal="totp-setup-modal">
      <div class="modal">
        <div class="modal-title">Enable Two-Factor Authentication</div>
        <div id="totp-setup-step1">
          <p style="font-size:13px;margin-bottom:16px">Scan this QR code with your authenticator app:</p>
          <div id="totp-qr" style="text-align:center;margin-bottom:16px;background:#fff;display:inline-block;padding:8px;border-radius:4px;width:100%"></div>
          <details style="margin-bottom:16px"><summary style="color:var(--text-muted);font-size:12px;cursor:pointer;user-select:none">Or enter secret manually</summary>
            <div id="totp-secret-display" class="mono" style="background:var(--bg-deep);padding:8px 12px;border-radius:4px;font-size:13px;word-break:break-all;margin-top:8px"></div>
          </details>
          <div style="background:var(--bg-deep);padding:12px;border-radius:4px;border:1px solid var(--color-warning);margin-bottom:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <p style="font-size:13px;font-weight:600;color:var(--color-warning)">Save these backup codes</p>
              <button class="btn btn-secondary" style="font-size:11px;padding:3px 10px" id="btn-download-codes"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px">download</span>Download .txt</button>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Store them somewhere safe. Each code can only be used once.</p>
            <div id="totp-backup-codes" class="mono" style="font-size:13px;line-height:1.8"></div>
          </div>
          <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Verify code from authenticator</label>
          <input type="text" id="totp-confirm-code" class="form-input" placeholder="Enter 6-digit code" maxlength="6" style="width:100%">
          <div id="totp-setup-error" class="modal-error"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-close-modal="totp-setup-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-totp">Verify & Enable</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TOTP Disable Modal -->
    <div id="totp-disable-modal" class="modal-overlay" data-close-modal="totp-disable-modal">
      <div class="modal">
        <div class="modal-title">Disable Two-Factor Authentication</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Enter your current 2FA code or a backup code to confirm.</p>
        <input type="text" id="totp-disable-code" class="form-input" placeholder="Enter code" style="width:100%">
        <div id="totp-disable-error" class="modal-error"></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal="totp-disable-modal">Cancel</button>
          <button class="btn btn-secondary" style="border-color:var(--color-danger);color:var(--color-danger)" id="btn-confirm-disable-totp">Disable 2FA</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Contact Identities (${contacts.length})</div>
      </div>
      ${
          contacts.length > 0
              ? `
      <table>
        <colgroup><col style="width:140px"><col><col style="width:120px"><col style="width:120px"><col style="width:130px"><col style="width:60px"></colgroup>
        <thead><tr><th>Type</th><th>Value</th><th>Label</th><th>Platform</th><th>Status</th><th></th></tr></thead>
        <tbody>${contactRows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">No contact identities</p>'
      }
      <details style="margin-top:12px">
        <summary style="color:var(--text-muted);font-size:12px;cursor:pointer;user-select:none">Add contact identity</summary>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Type</label>
            <select id="contact-type" class="form-select">
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone</option>
              <option value="INSTANT_MESSAGE">Instant Message</option>
              <option value="SOCIAL_MEDIA">Social Media</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Value</label>
            <input type="text" id="contact-value" class="form-input" placeholder="e.g. user@example.com">
            <div class="field-error" id="err-contact-value"></div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Label (optional)</label>
            <input type="text" id="contact-label" class="form-input" placeholder="e.g. Work">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Platform (optional)</label>
            <input type="text" id="contact-platform" class="form-input" placeholder="e.g. Slack">
          </div>
          <div style="grid-column:1/-1">
            <button class="btn btn-primary" style="font-size:12px" id="btn-add-contact">Add</button>
          </div>
        </div>
      </details>
    </div>

    ${
        isHuman
            ? `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Government IDs (${govIds.length})${infoIcon("gov-id-verification", INFO_VERIFICATION_LEVEL)}</div>
      </div>
      ${
          govIds.length > 0
              ? `
      <table>
        <colgroup><col style="width:160px"><col style="width:180px"><col><col style="width:130px"><col style="width:60px"></colgroup>
        <thead><tr><th>Country</th><th>ID Type</th><th>Value</th><th>Status</th><th></th></tr></thead>
        <tbody>${govIdRows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">No government IDs</p>'
      }
      <details style="margin-top:12px">
        <summary style="color:var(--text-muted);font-size:12px;cursor:pointer;user-select:none">Add government ID</summary>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Country</label>
            <select id="gov-country" class="form-select">
              <option value="">Select country</option>
              ${countryOptions}
            </select>
            <div class="field-error" id="err-gov-country"></div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">ID Type</label>
            <select id="gov-id-type" class="form-select">
              <option value="">Select country first</option>
            </select>
            <div class="field-error" id="err-gov-id-type"></div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">ID Value</label>
            <input type="text" id="gov-id-value" class="form-input" placeholder="Enter ID number">
            <div class="field-error" id="err-gov-id-value"></div>
          </div>
          <div style="grid-column:1/-1">
            <button class="btn btn-primary" style="font-size:12px" id="btn-add-gov-id">Add</button>
          </div>
        </div>
      </details>
    </div>
    `
            : ""
    }

    ${
        isOrg
            ? `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Company IDs (${companyIds.length})${infoIcon("company-id-verification", INFO_VERIFICATION_LEVEL)}</div>
      </div>
      ${
          companyIds.length > 0
              ? `
      <table>
        <colgroup><col style="width:180px"><col style="width:160px"><col><col style="width:130px"><col style="width:60px"></colgroup>
        <thead><tr><th>Type</th><th>Country</th><th>Value</th><th>Status</th><th></th></tr></thead>
        <tbody>${companyIdRows}</tbody>
      </table>
      `
              : '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">No company IDs</p>'
      }
      <details style="margin-top:12px">
        <summary style="color:var(--text-muted);font-size:12px;cursor:pointer;user-select:none">Add company ID</summary>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Type</label>
            <select id="company-id-type" class="form-select">
              <option value="COMPANY_REG">Company Registration</option>
              <option value="VAT">VAT Number</option>
              <option value="EORI">EORI</option>
              <option value="LEI">LEI</option>
              <option value="DUNS">DUNS</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">Country (optional)</label>
            <select id="company-country" class="form-select">
              <option value="">None</option>
              ${countryOptions}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px">ID Value</label>
            <input type="text" id="company-id-value" class="form-input" placeholder="Enter ID number">
            <div class="field-error" id="err-company-id-value"></div>
          </div>
          <div style="grid-column:1/-1">
            <button class="btn btn-primary" style="font-size:12px" id="btn-add-company-id">Add</button>
          </div>
        </div>
      </details>
    </div>
    `
            : ""
    }

    <script>window.__PAGE_DATA__ = { contacts: ${JSON.stringify(contacts)}, govIds: ${JSON.stringify(govIds)}, companyIds: ${JSON.stringify(companyIds)}, idTypesMap: ${idTypesJson}, idLabelsMap: ${idLabelsJson} };</script>
    ${assetTags("pages/owner-profile.ts")}
  `;
    return renderPage("Profile", content, "/gui/owner/profile", "owner");
}

const ASSURANCE_LEVEL_INFO: Record<string, { badge: string; label: string }> = {
    ID_VERIFIED: { badge: "badge-green", label: "ID VERIFIED" },
    ID_FORMAT_VALID: { badge: "badge-amber", label: "ID FORMAT VALID" },
    CONTACT_VERIFIED: { badge: "badge-amber", label: "CONTACT VERIFIED" },
    SELF_DECLARED: { badge: "badge-muted", label: "SELF DECLARED" },
    NONE: { badge: "badge-muted", label: "NONE" },
};

const ASSURANCE_LEVEL_POPOVER = `
  <div class="info-title">Identity Assurance Levels</div>
  <p style="margin-bottom:8px">Your assurance level is automatically computed from the identity information you provide. Policies can require a minimum level before allowing certain actions.</p>
  <dl>
    <dt><span class="badge badge-green">ID VERIFIED</span></dt>
    <dd>A government or company ID has been fully verified</dd>
    <dt><span class="badge badge-amber">ID FORMAT VALID</span></dt>
    <dd>A government or company ID passes format validation but is not yet verified</dd>
    <dt><span class="badge badge-amber">CONTACT VERIFIED</span></dt>
    <dd>At least one contact identity (email, phone, etc.) has been verified</dd>
    <dt><span class="badge badge-muted">SELF DECLARED</span></dt>
    <dd>Identity information has been added but nothing is verified yet</dd>
    <dt><span class="badge badge-muted">NONE</span></dt>
    <dd>No identity information provided</dd>
  </dl>`;

const SECURITY_2FA_POPOVER = `
  <div class="info-title">Two-Factor Authentication (2FA)</div>
  <p style="margin-bottom:8px">2FA adds a second verification step using a Time-based One-Time Password (TOTP) from an authenticator app (e.g. Google Authenticator, Authy).</p>
  <p style="margin-bottom:8px">When enabled, you will need to enter a 6-digit code from your authenticator app to approve or deny agent requests and policy drafts.</p>
  <p><strong style="color:var(--text-primary)">Backup codes</strong> are single-use recovery codes in case you lose access to your authenticator app. Store them securely.</p>`;

function assuranceLevelDisplay(level: string | undefined): string {
    const info = ASSURANCE_LEVEL_INFO[level ?? "NONE"] ?? ASSURANCE_LEVEL_INFO["NONE"];
    return `<span class="badge ${info.badge}">${info.label}</span>`;
}

function verificationBadge(level: string): string {
    switch (level) {
        case "VERIFIED":
            return '<span class="badge badge-green">VERIFIED</span>';
        case "FORMAT_VALID":
            return '<span class="badge badge-amber">FORMAT VALID</span>';
        default:
            return '<span class="badge badge-muted">UNVERIFIED</span>';
    }
}
