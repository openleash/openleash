import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_OWNER_STATUS,
    INFO_VERIFICATION_LEVEL,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

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

export function renderOwnerProfile(data: OwnerProfileData, renderPageOptions?: RenderPageOptions): string {
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
      <td><button class="btn btn-secondary profile-btn-remove" data-action="remove-contact" data-index="${i}">Remove</button></td>
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
      <td><button class="btn btn-secondary profile-btn-remove" data-action="remove-gov-id" data-index="${i}">Remove</button></td>
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
      <td><button class="btn btn-secondary profile-btn-remove" data-action="remove-company-id" data-index="${i}">Remove</button></td>
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
          <tr><td class="text-muted">Principal ID</td><td>${copyableId(data.owner_principal_id, data.owner_principal_id.length)}</td></tr>
          <tr><td class="text-muted">Display Name</td><td>
            <span id="display-name-view" class="profile-name-view">
              <span>${escapeHtml(data.display_name)}</span>
              <button class="btn btn-secondary profile-btn-inline-edit" id="btn-show-name-edit">Edit</button>
            </span>
            <span id="display-name-edit" class="profile-name-edit">
              <input type="text" id="new-display-name" value="${escapeHtml(data.display_name)}" class="form-input profile-name-input">
              <button class="btn btn-primary profile-btn-action" id="btn-update-name">Save</button>
              <button class="btn btn-secondary profile-btn-action" id="btn-hide-name-edit">Cancel</button>
              <div class="field-error profile-field-error-full" id="err-new-display-name"></div>
            </span>
          </td></tr>
          <tr><td class="text-muted">Type</td><td>${escapeHtml(data.principal_type)}</td></tr>
          <tr><td class="text-muted">Status</td><td><span class="badge ${data.status === "ACTIVE" ? "badge-green" : "badge-red"}">${escapeHtml(data.status)}</span>${infoIcon("owner-status", INFO_OWNER_STATUS)}</td></tr>
          <tr><td class="text-muted">Assurance Level</td><td>${assuranceLevelDisplay(data.identity_assurance_level)}${infoIcon("assurance-level", ASSURANCE_LEVEL_POPOVER)}</td></tr>
          <tr><td class="text-muted">Created</td><td class="mono">${formatTimestamp(data.created_at)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Security${infoIcon("security-2fa", SECURITY_2FA_POPOVER)}</div>
      ${
          data.totp_enabled
              ? `
      <div class="profile-security-status">
        <span class="badge badge-green">2FA Enabled</span>
        ${data.totp_enabled_at ? `<span class="profile-security-since">since ${formatTimestamp(data.totp_enabled_at)}</span>` : ""}
      </div>
      ${data.totp_backup_codes_remaining !== undefined ? `<p class="profile-hint">${data.totp_backup_codes_remaining} backup code${data.totp_backup_codes_remaining !== 1 ? "s" : ""} remaining</p>` : ""}
      <button class="btn btn-secondary btn-danger-outline" id="btn-open-disable-modal">Disable 2FA</button>
      `
              : `
      <p class="profile-hint">Two-Factor Authentication: Not configured</p>
      <button class="btn btn-primary" id="btn-setup-totp">Enable 2FA</button>
      `
      }
    </div>

    <!-- TOTP Setup Modal -->
    <div id="totp-setup-modal" class="modal-overlay" data-close-modal="totp-setup-modal">
      <div class="modal">
        <div class="modal-title">Enable Two-Factor Authentication</div>
        <div id="totp-setup-step1">
          <p class="profile-modal-text">Scan this QR code with your authenticator app:</p>
          <div id="totp-qr" class="profile-qr-wrap"></div>
          <details class="profile-details-section"><summary class="profile-summary">Or enter secret manually</summary>
            <div id="totp-secret-display" class="mono profile-secret-display"></div>
          </details>
          <div class="profile-backup-box">
            <div class="profile-backup-header">
              <p class="profile-backup-title">Save these backup codes</p>
              <button class="btn btn-secondary profile-btn-download" id="btn-download-codes"><span class="material-symbols-outlined profile-btn-icon">download</span>Download .txt</button>
            </div>
            <p class="profile-backup-hint">Store them somewhere safe. Each code can only be used once.</p>
            <div id="totp-backup-codes" class="mono profile-backup-codes"></div>
          </div>
          <label class="detail-label">Verify code from authenticator</label>
          <input type="text" id="totp-confirm-code" class="form-input profile-input-full" placeholder="Enter 6-digit code" maxlength="6">
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
        <p class="profile-modal-subtitle">Enter your current 2FA code or a backup code to confirm.</p>
        <input type="text" id="totp-disable-code" class="form-input profile-input-full" placeholder="Enter code">
        <div id="totp-disable-error" class="modal-error"></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal="totp-disable-modal">Cancel</button>
          <button class="btn btn-secondary btn-danger-outline" id="btn-confirm-disable-totp">Disable 2FA</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="profile-section-header">
        <div class="card-title">Contact Identities (${contacts.length})</div>
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
              : '<p class="profile-empty">No contact identities</p>'
      }
      <details class="profile-add-section">
        <summary class="profile-summary">Add contact identity</summary>
        <div class="profile-form-grid-2">
          <div>
            <label class="detail-label">Type</label>
            <select id="contact-type" class="form-select">
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone</option>
              <option value="INSTANT_MESSAGE">Instant Message</option>
              <option value="SOCIAL_MEDIA">Social Media</option>
            </select>
          </div>
          <div>
            <label class="detail-label">Value</label>
            <input type="text" id="contact-value" class="form-input" placeholder="e.g. user@example.com">
            <div class="field-error" id="err-contact-value"></div>
          </div>
          <div>
            <label class="detail-label">Label (optional)</label>
            <input type="text" id="contact-label" class="form-input" placeholder="e.g. Work">
          </div>
          <div>
            <label class="detail-label">Platform (optional)</label>
            <input type="text" id="contact-platform" class="form-input" placeholder="e.g. Slack">
          </div>
          <div class="profile-form-full-row">
            <button class="btn btn-primary btn-sm" id="btn-add-contact">Add</button>
          </div>
        </div>
      </details>
    </div>

    ${
        isHuman
            ? `
    <div class="card">
      <div class="profile-section-header">
        <div class="card-title">Government IDs (${govIds.length})${infoIcon("gov-id-verification", INFO_VERIFICATION_LEVEL)}</div>
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
              : '<p class="profile-empty">No government IDs</p>'
      }
      <details class="profile-add-section">
        <summary class="profile-summary">Add government ID</summary>
        <div class="profile-form-grid-3">
          <div>
            <label class="detail-label">Country</label>
            <select id="gov-country" class="form-select">
              <option value="">Select country</option>
              ${countryOptions}
            </select>
            <div class="field-error" id="err-gov-country"></div>
          </div>
          <div>
            <label class="detail-label">ID Type</label>
            <select id="gov-id-type" class="form-select">
              <option value="">Select country first</option>
            </select>
            <div class="field-error" id="err-gov-id-type"></div>
          </div>
          <div>
            <label class="detail-label">ID Value</label>
            <input type="text" id="gov-id-value" class="form-input" placeholder="Enter ID number">
            <div class="field-error" id="err-gov-id-value"></div>
          </div>
          <div class="profile-form-full-row">
            <button class="btn btn-primary btn-sm" id="btn-add-gov-id">Add</button>
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
      <div class="profile-section-header">
        <div class="card-title">Company IDs (${companyIds.length})${infoIcon("company-id-verification", INFO_VERIFICATION_LEVEL)}</div>
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
              : '<p class="profile-empty">No company IDs</p>'
      }
      <details class="profile-add-section">
        <summary class="profile-summary">Add company ID</summary>
        <div class="profile-form-grid-3">
          <div>
            <label class="detail-label">Type</label>
            <select id="company-id-type" class="form-select">
              <option value="COMPANY_REG">Company Registration</option>
              <option value="VAT">VAT Number</option>
              <option value="EORI">EORI</option>
              <option value="LEI">LEI</option>
              <option value="DUNS">DUNS</option>
            </select>
          </div>
          <div>
            <label class="detail-label">Country (optional)</label>
            <select id="company-country" class="form-select">
              <option value="">None</option>
              ${countryOptions}
            </select>
          </div>
          <div>
            <label class="detail-label">ID Value</label>
            <input type="text" id="company-id-value" class="form-input" placeholder="Enter ID number">
            <div class="field-error" id="err-company-id-value"></div>
          </div>
          <div class="profile-form-full-row">
            <button class="btn btn-primary btn-sm" id="btn-add-company-id">Add</button>
          </div>
        </div>
      </details>
    </div>
    `
            : ""
    }

    <script>window.__PAGE_DATA__ = { contacts: ${JSON.stringify(contacts)}, govIds: ${JSON.stringify(govIds)}, companyIds: ${JSON.stringify(companyIds)}, idTypesMap: ${idTypesJson}, idLabelsMap: ${idLabelsJson} };</script>
    ${assetTags("pages/owner-profile/client.ts")}
  `;
    return renderPage("Profile", content, "/gui/owner/profile", "owner", renderPageOptions);
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
  <p class="profile-popover-text">Your assurance level is automatically computed from the identity information you provide. Policies can require a minimum level before allowing certain actions.</p>
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
  <p class="profile-popover-text">2FA adds a second verification step using a Time-based One-Time Password (TOTP) from an authenticator app (e.g. Google Authenticator, Authy).</p>
  <p class="profile-popover-text">When enabled, you will need to enter a 6-digit code from your authenticator app to approve or deny agent requests and policy drafts.</p>
  <p><strong class="text-primary-force">Backup codes</strong> are single-use recovery codes in case you lose access to your authenticator app. Store them securely.</p>`;

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
