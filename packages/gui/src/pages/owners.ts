import { renderPage, escapeHtml, formatNameWithId } from '../layout.js';
import { EU_PERSONAL_ID_TYPES } from '@openleash/core';

// ─── Country data ─────────────────────────────────────────────────────

const EU_COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia',
  CY: 'Cyprus', CZ: 'Czech Republic', DK: 'Denmark', EE: 'Estonia',
  FI: 'Finland', FR: 'France', DE: 'Germany', GR: 'Greece',
  HU: 'Hungary', IE: 'Ireland', IT: 'Italy', LV: 'Latvia',
  LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands',
  PL: 'Poland', PT: 'Portugal', RO: 'Romania', SK: 'Slovakia',
  SI: 'Slovenia', ES: 'Spain', SE: 'Sweden',
};

function countryFlag(code: string): string {
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65),
  );
}

// Human-readable labels for government ID types
const GOV_ID_LABELS: Record<string, string> = {
  PERSONNUMMER: 'Personnummer',
  BSN: 'BSN (Burgerservicenummer)',
  RIJKSREGISTERNUMMER: 'Rijksregisternummer',
  PESEL: 'PESEL',
  HENKILOTUNNUS: 'Henkilötunnus',
  DNI: 'DNI',
  NIE: 'NIE (Foreigners)',
  CODICE_FISCALE: 'Codice Fiscale',
  STEUER_ID: 'Steuer-ID',
  NIR: 'NIR (Sécurité sociale)',
  OIB: 'OIB',
  EGN: 'EGN',
  RODNE_CISLO: 'Rodné číslo',
  CPR: 'CPR-nummer',
  ISIKUKOOD: 'Isikukood',
  AMKA: 'AMKA',
  PPSN: 'PPS Number',
  ASMENS_KODAS: 'Asmens kodas',
  NIF: 'NIF',
  CNP: 'CNP',
  EMSO: 'EMŠO',
  ZMR: 'ZMR-Zahl',
  ARC: 'ARC Number',
  SZEMELYI_SZAM: 'Személyi szám',
  ADOAZONOSITO: 'Adóazonosító jel',
  PERSONAS_KODS: 'Personas kods',
  MATRICULE: 'Matricule',
  ID_CARD: 'ID Card Number',
};

// Example placeholder values per COUNTRY:ID_TYPE
const GOV_ID_EXAMPLES: Record<string, string> = {
  'SE:PERSONNUMMER': '19850101-1234',
  'NL:BSN': '123456782',
  'BE:RIJKSREGISTERNUMMER': '85.01.01-123.45',
  'PL:PESEL': '85010112345',
  'FI:HENKILOTUNNUS': '010185-123A',
  'ES:DNI': '12345678Z',
  'ES:NIE': 'X1234567L',
  'IT:CODICE_FISCALE': 'RSSMRA85A01H501Z',
  'DE:STEUER_ID': '12345678901',
  'FR:NIR': '185017512345678',
  'HR:OIB': '12345678901',
  'BG:EGN': '8501011234',
  'CZ:RODNE_CISLO': '850101/1234',
  'DK:CPR': '010185-1234',
  'EE:ISIKUKOOD': '38501011234',
  'GR:AMKA': '01018512345',
  'IE:PPSN': '1234567TA',
  'LT:ASMENS_KODAS': '38501011234',
  'PT:NIF': '123456789',
  'RO:CNP': '1850101123456',
  'SK:RODNE_CISLO': '850101/1234',
  'SI:EMSO': '0101985500123',
  'AT:ZMR': '123456789012',
  'CY:ARC': '1234567',
  'HU:SZEMELYI_SZAM': '123456AB',
  'HU:ADOAZONOSITO': '1234567890',
  'LV:PERSONAS_KODS': '010185-12345',
  'LU:MATRICULE': '1234567890123',
  'MT:ID_CARD': '1234567M',
};

// Example placeholder values per company ID type
const COMPANY_ID_EXAMPLES: Record<string, string> = {
  COMPANY_REG: '5560123456',
  VAT: 'SE556012345601',
  EORI: 'SE123456789012',
  LEI: '529900T8BM49AURSDO55',
  DUNS: '123456789',
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
  contact_identities?: { contact_id: string; type: string; value: string; label?: string; platform?: string; verified: boolean; verified_at: string | null; added_at: string }[];
  government_ids?: { country: string; id_type: string; id_value: string; verification_level: string; verified_at: string | null; added_at: string }[];
  company_ids?: { id_type: string; country?: string; id_value: string; verification_level: string; verified_at: string | null; added_at: string }[];
  signatories?: { signatory_id: string; human_owner_principal_id: string; role: string; signing_authority: string; scope_description?: string; valid_from?: string; valid_until: string | null; added_at: string }[];
  signatory_rules?: { rule_id: string; description: string; required_signatories: number; from_roles?: string[]; scope_description?: string; conditions?: Record<string, unknown> }[];
}

export interface OwnerDetailData {
  owner: OwnerData;
  agents: { agent_id: string; agent_principal_id: string; status: string; created_at: string }[];
  policies: { policy_id: string; applies_to_agent_principal_id: string | null }[];
  audit: { event_id: string; timestamp: string; event_type: string; metadata_json: Record<string, unknown> }[];
  linked_humans?: { owner_principal_id: string; display_name: string }[];
  all_humans?: { owner_principal_id: string; display_name: string }[];
}

// ─── Badge helpers ────────────────────────────────────────────────────

function statusBadge(status?: string): string {
  if (!status) return '<span class="badge badge-muted">UNKNOWN</span>';
  switch (status) {
    case 'ACTIVE': return '<span class="badge badge-green">ACTIVE</span>';
    case 'SUSPENDED': return '<span class="badge badge-amber">SUSPENDED</span>';
    case 'REVOKED': return '<span class="badge badge-red">REVOKED</span>';
    default: return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
  }
}

function eventBadge(type: string): string {
  if (type.includes('CREATED') || type.includes('REGISTERED') || type.includes('STARTED')) {
    return `<span class="badge badge-green">${escapeHtml(type)}</span>`;
  }
  if (type.includes('DENY') || type.includes('REVOKED') || type.includes('ERROR')) {
    return `<span class="badge badge-red">${escapeHtml(type)}</span>`;
  }
  if (type.includes('UPSERTED') || type.includes('ROTATED')) {
    return `<span class="badge badge-amber">${escapeHtml(type)}</span>`;
  }
  return `<span class="badge badge-muted">${escapeHtml(type)}</span>`;
}

function verificationBadge(level?: string): string {
  if (!level || level === 'UNVERIFIED') return '<span class="badge badge-muted">UNVERIFIED</span>';
  if (level === 'FORMAT_VALID') return '<span class="badge badge-amber">FORMAT VALID</span>';
  if (level === 'VERIFIED') return '<span class="badge badge-green">VERIFIED</span>';
  return `<span class="badge badge-muted">${escapeHtml(level)}</span>`;
}

function assuranceBadge(level?: string): string {
  if (!level || level === 'NONE') return '<span class="badge badge-muted">NONE</span>';
  if (level === 'SELF_DECLARED') return '<span class="badge badge-muted">SELF-DECLARED</span>';
  if (level === 'CONTACT_VERIFIED') return '<span class="badge badge-amber">CONTACT VERIFIED</span>';
  if (level === 'ID_FORMAT_VALID') return '<span class="badge badge-amber">ID FORMAT VALID</span>';
  if (level === 'ID_VERIFIED') return '<span class="badge badge-green">ID VERIFIED</span>';
  return `<span class="badge badge-muted">${escapeHtml(level)}</span>`;
}

// ─── Country dropdown helpers ─────────────────────────────────────────

function countryOptions(): string {
  return Object.entries(EU_COUNTRY_NAMES)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([code, name]) => `<option value="${escapeHtml(code)}">${countryFlag(code)} ${escapeHtml(code)} — ${escapeHtml(name)}</option>`)
    .join('');
}

function contactTypeLabel(type: string): string {
  switch (type) {
    case 'EMAIL': return 'Email';
    case 'PHONE': return 'Phone';
    case 'INSTANT_MESSAGE': return 'IM';
    case 'SOCIAL_MEDIA': return 'Social';
    default: return type;
  }
}

// ─── Owners List Page ─────────────────────────────────────────────────

export function renderOwners(owners: OwnerData[]): string {
  const rows = owners.map((o) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(o.owner_principal_id)}">
        <a href="/gui/owners/${escapeHtml(o.owner_principal_id)}" class="table-link">${escapeHtml(o.owner_principal_id.slice(0, 8))}...</a>
      </td>
      <td>${escapeHtml(o.display_name ?? '-')}</td>
      <td>${escapeHtml(o.principal_type ?? '-')}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="mono">${escapeHtml(o.created_at?.slice(0, 10) ?? '-')}</td>
      <td>
        <a href="/gui/owners/${escapeHtml(o.owner_principal_id)}" class="btn btn-secondary" style="padding:4px 10px;font-size:12px">View</a>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>Owners</h2>
        <p>${owners.length} registered owner${owners.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="toggleForm()">+ Add Owner</button>
    </div>

    <div id="alert-container"></div>

    <div id="owner-form" class="card hidden">
      <div class="card-title">Add New Owner</div>

      <div class="form-group">
        <label for="display-name">Display Name</label>
        <input type="text" id="display-name" class="form-input" placeholder="e.g. Alice Johnson">
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
        <thead>
          <tr>
            <th>Principal ID</th>
            <th>Display Name</th>
            <th>Type</th>
            <th>Status</th>
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
        const alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        if (!displayName) {
          alertContainer.innerHTML = '<div class="alert alert-error">Display name is required</div>';
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
          alertContainer.innerHTML = '<div class="alert alert-success">Owner \\'' + displayName.replace(/</g, '&lt;') + '\\' created (ID: ' + result.owner_principal_id.slice(0, 8) + '...). Reloading...</div>';
          setTimeout(() => { window.location.reload(); }, 1000);
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">' + String(err.message || err).replace(/</g, '&lt;') + '</div>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Create Owner';
        }
      }
    </script>
  `;

  return renderPage('Owners', content, '/gui/owners');
}

// ─── Contact Identities Card ──────────────────────────────────────────

function renderContactIdentitiesCard(owner: OwnerData): string {
  const contacts = owner.contact_identities ?? [];
  const rows = contacts.map((c, i) => `
    <tr>
      <td>${escapeHtml(contactTypeLabel(c.type))}</td>
      <td class="mono">${escapeHtml(c.value)}</td>
      <td>${escapeHtml(c.label ?? '-')}</td>
      <td>${escapeHtml(c.platform ?? '-')}</td>
      <td>${c.verified ? '<span class="badge badge-green">VERIFIED</span>' : '<span class="badge badge-muted">UNVERIFIED</span>'}</td>
      <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;color:var(--red-bright)" onclick="removeContact(${i})" title="Remove">&times;</button></td>
    </tr>
  `).join('');

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Contact Identities (${contacts.length})</div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="toggleIdentityForm('contact-form')">+ Add Contact</button>
      </div>
      ${contacts.length > 0 ? `
      <table>
        <thead>
          <tr><th>Type</th><th>Value</th><th>Label</th><th>Platform</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);font-size:13px">No contact identities added yet</p>'}

      <div id="contact-form" class="hidden" style="margin-top:16px;border-top:1px solid var(--border-subtle);padding-top:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label for="contact-type">Type</label>
            <select id="contact-type" class="form-select" onchange="onContactTypeChange()">
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone</option>
              <option value="INSTANT_MESSAGE">Instant Message</option>
              <option value="SOCIAL_MEDIA">Social Media</option>
            </select>
          </div>
          <div class="form-group">
            <label for="contact-value" id="contact-value-label">Email Address</label>
            <input type="text" id="contact-value" class="form-input" placeholder="alice@example.com">
            <div class="form-help" id="contact-value-help">Standard email address</div>
          </div>
          <div class="form-group">
            <label for="contact-label">Label (optional)</label>
            <input type="text" id="contact-label" class="form-input" placeholder="e.g. Work email">
          </div>
          <div class="form-group" id="contact-platform-group" style="display:none">
            <label for="contact-platform">Platform</label>
            <select id="contact-platform" class="form-select">
              <option value="">Select platform</option>
              <option value="SIGNAL">Signal</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SLACK">Slack</option>
              <option value="DISCORD">Discord</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="X">X (Twitter)</option>
              <option value="GITHUB">GitHub</option>
              <option value="MASTODON">Mastodon</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div id="contact-validation-hint" style="font-size:12px;margin-bottom:8px"></div>
        <div class="toolbar" style="margin-top:4px">
          <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="addContact()">Add Contact</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="toggleIdentityForm('contact-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Government IDs Card ──────────────────────────────────────────────

function renderGovernmentIdsCard(owner: OwnerData): string {
  const ids = owner.government_ids ?? [];
  const rows = ids.map((g, i) => `
    <tr>
      <td>${countryFlag(g.country)} ${escapeHtml(g.country)}</td>
      <td>${escapeHtml(GOV_ID_LABELS[g.id_type] ?? g.id_type.replace(/_/g, ' '))}</td>
      <td class="mono">${escapeHtml(g.id_value)}</td>
      <td>${verificationBadge(g.verification_level)}</td>
      <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;color:var(--red-bright)" onclick="removeGovernmentId(${i})" title="Remove">&times;</button></td>
    </tr>
  `).join('');

  const countryOpts = countryOptions();

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Government IDs (${ids.length})</div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="toggleIdentityForm('gov-form')">+ Add ID</button>
      </div>
      ${ids.length > 0 ? `
      <table>
        <thead>
          <tr><th>Country</th><th>ID Type</th><th>Value</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);font-size:13px">No government IDs added yet</p>'}

      <div id="gov-form" class="hidden" style="margin-top:16px;border-top:1px solid var(--border-subtle);padding-top:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="form-group">
            <label for="gov-country">Country</label>
            <select id="gov-country" class="form-select" onchange="onGovCountryChange()">
              <option value="" disabled selected>Select country</option>
              ${countryOpts}
            </select>
          </div>
          <div class="form-group">
            <label for="gov-id-type">ID Type</label>
            <select id="gov-id-type" class="form-select" onchange="onGovIdTypeChange()">
              <option value="" disabled selected>Select country first</option>
            </select>
          </div>
          <div class="form-group">
            <label for="gov-id-value">ID Value</label>
            <input type="text" id="gov-id-value" class="form-input" placeholder="Select country and ID type first">
            <div class="form-help" id="gov-id-help"></div>
          </div>
        </div>
        <div id="gov-validation-result" style="font-size:12px;margin-bottom:8px"></div>
        <div class="toolbar" style="margin-top:4px">
          <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="addGovernmentId()">Add Government ID</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="validateGovId()">Validate</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="toggleIdentityForm('gov-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Company IDs Card ─────────────────────────────────────────────────

function renderCompanyIdsCard(owner: OwnerData): string {
  const ids = owner.company_ids ?? [];
  const rows = ids.map((c, i) => `
    <tr>
      <td>${escapeHtml(c.id_type)}</td>
      <td>${c.country ? `${countryFlag(c.country)} ${escapeHtml(c.country)}` : '-'}</td>
      <td class="mono">${escapeHtml(c.id_value)}</td>
      <td>${verificationBadge(c.verification_level)}</td>
      <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;color:var(--red-bright)" onclick="removeCompanyId(${i})" title="Remove">&times;</button></td>
    </tr>
  `).join('');

  const countryOpts = countryOptions();

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Company IDs (${ids.length})</div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="toggleIdentityForm('company-form')">+ Add ID</button>
      </div>
      ${ids.length > 0 ? `
      <table>
        <thead>
          <tr><th>Type</th><th>Country</th><th>Value</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);font-size:13px">No company IDs added yet</p>'}

      <div id="company-form" class="hidden" style="margin-top:16px;border-top:1px solid var(--border-subtle);padding-top:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="form-group">
            <label for="company-id-type">ID Type</label>
            <select id="company-id-type" class="form-select" onchange="onCompanyTypeChange()">
              <option value="" disabled selected>Select type</option>
              <option value="COMPANY_REG">Company Registration</option>
              <option value="VAT">VAT Number</option>
              <option value="EORI">EORI</option>
              <option value="LEI">LEI</option>
              <option value="DUNS">DUNS</option>
            </select>
          </div>
          <div class="form-group" id="company-country-group" style="display:none">
            <label for="company-country">Country</label>
            <select id="company-country" class="form-select">
              <option value="" disabled selected>Select country</option>
              ${countryOpts}
            </select>
          </div>
          <div class="form-group">
            <label for="company-id-value">ID Value</label>
            <input type="text" id="company-id-value" class="form-input" placeholder="Select a type first">
            <div class="form-help" id="company-id-help"></div>
          </div>
        </div>
        <div id="company-validation-result" style="font-size:12px;margin-bottom:8px"></div>
        <div class="toolbar" style="margin-top:4px">
          <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="addCompanyId()">Add Company ID</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="validateCompanyId()">Validate</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="toggleIdentityForm('company-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Signatories Card ─────────────────────────────────────────────────

function renderSignatoriesCard(
  owner: OwnerData,
  linkedHumans: { owner_principal_id: string; display_name: string }[],
  allHumans: { owner_principal_id: string; display_name: string }[],
): string {
  const signatories = owner.signatories ?? [];
  const humanMap = new Map(linkedHumans.map((h) => [h.owner_principal_id, h.display_name]));
  const rows = signatories.map((s, i) => {
    const name = humanMap.get(s.human_owner_principal_id) ?? s.human_owner_principal_id.slice(0, 8) + '...';
    return `
    <tr>
      <td><a href="/gui/owners/${escapeHtml(s.human_owner_principal_id)}" class="table-link">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(s.role.replace(/_/g, ' '))}</td>
      <td>${escapeHtml(s.signing_authority)}</td>
      <td>${escapeHtml(s.scope_description ?? '-')}</td>
      <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;color:var(--red-bright)" onclick="removeSignatory(${i})" title="Remove">&times;</button></td>
    </tr>
    `;
  }).join('');

  const humanOptions = allHumans.map((h) =>
    `<option value="${escapeHtml(h.owner_principal_id)}">${escapeHtml(h.display_name)} (${escapeHtml(h.owner_principal_id.slice(0, 8))}...)</option>`
  ).join('');

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Signatories (${signatories.length})</div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="toggleIdentityForm('sig-form')">+ Add Signatory</button>
      </div>
      ${signatories.length > 0 ? `
      <table>
        <thead>
          <tr><th>Person</th><th>Role</th><th>Authority</th><th>Scope</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);font-size:13px">No signatories added yet</p>'}

      <div id="sig-form" class="hidden" style="margin-top:16px;border-top:1px solid var(--border-subtle);padding-top:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label for="sig-human">Person (Human Owner)</label>
            <select id="sig-human" class="form-select">
              <option value="" disabled selected>Select a human owner</option>
              ${humanOptions}
            </select>
            ${allHumans.length === 0 ? '<div class="form-help" style="color:var(--amber-bright)">No human owners exist yet. Create a human owner first.</div>' : ''}
          </div>
          <div class="form-group">
            <label for="sig-role">Role</label>
            <select id="sig-role" class="form-select">
              <option value="CEO">CEO</option>
              <option value="BOARD_CHAIRMAN">Board Chairman</option>
              <option value="BOARD_MEMBER">Board Member</option>
              <option value="AUTHORIZED_SIGNATORY">Authorized Signatory</option>
              <option value="PROCURATOR">Procurator</option>
              <option value="MANAGING_DIRECTOR">Managing Director</option>
              <option value="SECRETARY">Secretary</option>
              <option value="TREASURER">Treasurer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="sig-authority">Signing Authority</label>
            <select id="sig-authority" class="form-select">
              <option value="SOLE">Sole</option>
              <option value="JOINT">Joint</option>
            </select>
          </div>
          <div class="form-group">
            <label for="sig-scope">Scope (optional)</label>
            <input type="text" id="sig-scope" class="form-input" placeholder="e.g. Transactions up to 100k EUR">
          </div>
        </div>
        <div class="toolbar" style="margin-top:4px">
          <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="addSignatory()">Add Signatory</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="toggleIdentityForm('sig-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Signatory Rules Card ─────────────────────────────────────────────

function renderSignatoryRulesCard(owner: OwnerData): string {
  const rules = owner.signatory_rules ?? [];
  const rows = rules.map((r, i) => `
    <tr>
      <td>${escapeHtml(r.description)}</td>
      <td>${r.required_signatories}</td>
      <td>${escapeHtml((r.from_roles ?? []).join(', ') || 'Any')}</td>
      <td>${escapeHtml(r.scope_description ?? '-')}</td>
      <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:11px;color:var(--red-bright)" onclick="removeSignatoryRule(${i})" title="Remove">&times;</button></td>
    </tr>
  `).join('');

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">Signatory Rules (${rules.length})</div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="toggleIdentityForm('rule-form')">+ Add Rule</button>
      </div>
      ${rules.length > 0 ? `
      <table>
        <thead>
          <tr><th>Description</th><th>Required</th><th>Roles</th><th>Scope</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);font-size:13px">No signatory rules defined yet</p>'}

      <div id="rule-form" class="hidden" style="margin-top:16px;border-top:1px solid var(--border-subtle);padding-top:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label for="rule-desc">Description</label>
            <input type="text" id="rule-desc" class="form-input" placeholder="e.g. Two board members must co-sign">
          </div>
          <div class="form-group">
            <label for="rule-required">Required Signatories</label>
            <input type="number" id="rule-required" class="form-input" min="1" value="2">
          </div>
          <div class="form-group">
            <label for="rule-roles">From Roles (optional, comma-separated)</label>
            <input type="text" id="rule-roles" class="form-input" placeholder="e.g. BOARD_MEMBER, CEO">
          </div>
          <div class="form-group">
            <label for="rule-scope">Scope (optional)</label>
            <input type="text" id="rule-scope" class="form-input" placeholder="e.g. Transactions above 50k EUR">
          </div>
        </div>
        <div class="toolbar" style="margin-top:4px">
          <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="addSignatoryRule()">Add Rule</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px" onclick="toggleIdentityForm('rule-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Owner Detail Page ────────────────────────────────────────────────

function safeJsonEmbed(data: unknown): string {
  return JSON.stringify(data).replace(/<\//g, '<\\/');
}

export function renderOwnerDetail(data: OwnerDetailData): string {
  const { owner, agents, policies, audit, linked_humans, all_humans } = data;

  const agentRows = agents.map((a) => `
    <tr>
      <td class="mono">${escapeHtml(a.agent_id)}</td>
      <td class="mono truncate" title="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_principal_id.slice(0, 8))}...</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${escapeHtml(a.created_at.slice(0, 10))}</td>
    </tr>
  `).join('');

  const agentMap = new Map(agents.map((a) => [a.agent_principal_id, a.agent_id]));

  const policyRows = policies.map((p) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(p.policy_id)}">
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.policy_id.slice(0, 8))}...</a>
      </td>
      <td>${p.applies_to_agent_principal_id ? formatNameWithId(agentMap.get(p.applies_to_agent_principal_id), p.applies_to_agent_principal_id) : '<span style="color:var(--text-muted)">all agents</span>'}</td>
    </tr>
  `).join('');

  const auditRows = audit.map((e, i) => `
    <tr class="accordion-row" onclick="toggleAccordion(${i})" id="row-${i}">
      <td style="width:20px"><span class="chevron">&#9654;</span></td>
      <td class="mono" style="white-space:nowrap">${escapeHtml(e.timestamp.slice(0, 19).replace('T', ' '))}</td>
      <td>${eventBadge(e.event_type)}</td>
    </tr>
    <tr class="accordion-detail" id="detail-${i}">
      <td colspan="3">
        <div class="accordion-content">${Object.entries(e.metadata_json).map(([k, v]) =>
          `<div style="margin-bottom:6px"><span style="color:var(--green-bright)">${escapeHtml(k)}</span>: <span style="color:var(--text-primary)">${escapeHtml(typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v))}</span></div>`
        ).join('') || '<span style="color:var(--text-muted)">No metadata</span>'}</div>
      </td>
    </tr>
  `).join('');

  const attrEntries = Object.entries(owner.attributes ?? {});
  const attrHtml = attrEntries.length > 0
    ? attrEntries.map(([k, v]) => `
      <tr>
        <td style="width:160px;color:var(--text-muted)">${escapeHtml(k)}</td>
        <td class="mono">${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="2" style="color:var(--text-muted)">No custom attributes</td></tr>';

  // Embedded data for JavaScript form handlers
  const embeddedOwnerData = safeJsonEmbed({
    contact_identities: owner.contact_identities ?? [],
    government_ids: owner.government_ids ?? [],
    company_ids: owner.company_ids ?? [],
    signatories: owner.signatories ?? [],
    signatory_rules: owner.signatory_rules ?? [],
  });
  const embeddedEuIdTypes = safeJsonEmbed(EU_PERSONAL_ID_TYPES);
  const embeddedGovIdLabels = safeJsonEmbed(GOV_ID_LABELS);
  const embeddedGovIdExamples = safeJsonEmbed(GOV_ID_EXAMPLES);
  const embeddedCompanyIdExamples = safeJsonEmbed(COMPANY_ID_EXAMPLES);

  const content = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
        <h2>${escapeHtml(owner.display_name ?? 'Owner')}</h2>
        ${statusBadge(owner.status)}
        ${assuranceBadge(owner.identity_assurance_level)}
      </div>
      <p class="mono">${escapeHtml(owner.owner_principal_id)}</p>
    </div>

    <div id="identity-alert"></div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <tbody>
          <tr>
            <td style="width:160px;color:var(--text-muted)">Principal ID</td>
            <td class="mono">${escapeHtml(owner.owner_principal_id)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Display Name</td>
            <td>${escapeHtml(owner.display_name ?? '-')}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Type</td>
            <td>${escapeHtml(owner.principal_type ?? '-')}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Status</td>
            <td>${statusBadge(owner.status)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Created</td>
            <td class="mono">${escapeHtml(owner.created_at ?? '-')}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${attrEntries.length > 0 ? `
    <div class="card">
      <div class="card-title">Attributes</div>
      <table><tbody>${attrHtml}</tbody></table>
    </div>
    ` : ''}

    ${renderContactIdentitiesCard(owner)}
    ${owner.principal_type === 'HUMAN' ? renderGovernmentIdsCard(owner) : ''}
    ${owner.principal_type === 'ORG' ? renderCompanyIdsCard(owner) : ''}
    ${owner.principal_type === 'ORG' ? renderSignatoriesCard(owner, linked_humans ?? [], all_humans ?? []) : ''}
    ${owner.principal_type === 'ORG' ? renderSignatoryRulesCard(owner) : ''}

    <div class="card">
      <div class="card-title">Agents (${agents.length})</div>
      <table>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Principal ID</th>
            <th>Status</th>
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
      ${audit.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th style="width:20px"></th>
            <th>Timestamp</th>
            <th>Event</th>
          </tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);padding:8px 0">No activity recorded for this owner</p>'}
    </div>

    <div class="toolbar">
      <a href="/gui/owners" class="btn btn-secondary">Back to Owners</a>
    </div>

    <script>
      var ownerId = '${escapeHtml(owner.owner_principal_id)}';
      var ownerIdentity = ${embeddedOwnerData};
      var euIdTypes = ${embeddedEuIdTypes};
      var govIdLabels = ${embeddedGovIdLabels};
      var govIdExamples = ${embeddedGovIdExamples};
      var companyIdExamples = ${embeddedCompanyIdExamples};

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

      function toggleIdentityForm(formId) {
        document.getElementById(formId).classList.toggle('hidden');
      }

      function showIdentityAlert(msg, type) {
        var container = document.getElementById('identity-alert');
        container.innerHTML = '<div class="alert alert-' + type + '">' + msg.replace(/</g, '&lt;') + '</div>';
        if (type === 'success') {
          setTimeout(function() { window.location.reload(); }, 1000);
        }
      }

      // ── Contact Identity ──

      function onContactTypeChange() {
        var type = document.getElementById('contact-type').value;
        var valueInput = document.getElementById('contact-value');
        var valueLabel = document.getElementById('contact-value-label');
        var valueHelp = document.getElementById('contact-value-help');
        var platformGroup = document.getElementById('contact-platform-group');
        var labelInput = document.getElementById('contact-label');
        var hint = document.getElementById('contact-validation-hint');
        hint.innerHTML = '';

        switch (type) {
          case 'EMAIL':
            valueLabel.textContent = 'Email Address';
            valueInput.placeholder = 'alice@example.com';
            valueHelp.textContent = 'Standard email address';
            labelInput.placeholder = 'e.g. Work email';
            platformGroup.style.display = 'none';
            break;
          case 'PHONE':
            valueLabel.textContent = 'Phone Number';
            valueInput.placeholder = '+46 70 123 4567';
            valueHelp.textContent = 'International format: + country code + number';
            labelInput.placeholder = 'e.g. Mobile';
            platformGroup.style.display = 'none';
            break;
          case 'INSTANT_MESSAGE':
            valueLabel.textContent = 'Username / Handle';
            valueInput.placeholder = '@alice';
            valueHelp.textContent = 'Username or handle on the selected platform';
            labelInput.placeholder = 'e.g. Work IM';
            platformGroup.style.display = '';
            break;
          case 'SOCIAL_MEDIA':
            valueLabel.textContent = 'Profile URL / Handle';
            valueInput.placeholder = '@alice or profile URL';
            valueHelp.textContent = 'Profile handle or full URL';
            labelInput.placeholder = 'e.g. Company page';
            platformGroup.style.display = '';
            break;
        }
      }

      async function addContact() {
        var type = document.getElementById('contact-type').value;
        var value = document.getElementById('contact-value').value.trim();
        var label = document.getElementById('contact-label').value.trim();
        var platform = document.getElementById('contact-platform').value;

        if (!value) { showIdentityAlert('Value is required', 'error'); return; }

        // Strict validation
        if (type === 'EMAIL') {
          if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
            showIdentityAlert('Invalid email format. Expected format: alice@example.com', 'error');
            return;
          }
        } else if (type === 'PHONE') {
          if (!/^\\+\\d[\\d\\s\\-()]{6,18}$/.test(value)) {
            showIdentityAlert('Invalid phone format. Must start with + followed by country code and number. Example: +46 70 123 4567', 'error');
            return;
          }
        } else if (type === 'INSTANT_MESSAGE' || type === 'SOCIAL_MEDIA') {
          if (!platform) {
            showIdentityAlert('Please select a platform', 'error');
            return;
          }
        }

        var body = { type: type, value: value };
        if (label) body.label = label;
        if (platform) body.platform = platform;

        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/contact-identities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to add contact');
          }
          showIdentityAlert('Contact added. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      // ── Government ID ──

      function onGovCountryChange() {
        var country = document.getElementById('gov-country').value;
        var typeSelect = document.getElementById('gov-id-type');
        typeSelect.innerHTML = '<option value="" disabled selected>Select ID type</option>';
        var types = euIdTypes[country];
        if (types) {
          types.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t;
            opt.textContent = govIdLabels[t] || t.replace(/_/g, ' ');
            typeSelect.appendChild(opt);
          });
          // Auto-select if only one type
          if (types.length === 1) {
            typeSelect.value = types[0];
            onGovIdTypeChange();
          }
        }
        document.getElementById('gov-validation-result').innerHTML = '';
      }

      function onGovIdTypeChange() {
        var country = document.getElementById('gov-country').value;
        var idType = document.getElementById('gov-id-type').value;
        var valueInput = document.getElementById('gov-id-value');
        var helpDiv = document.getElementById('gov-id-help');

        if (country && idType) {
          var example = govIdExamples[country + ':' + idType];
          if (example) {
            valueInput.placeholder = example;
            helpDiv.textContent = 'Example: ' + example;
          } else {
            valueInput.placeholder = 'Enter ID value';
            helpDiv.textContent = '';
          }
        }
        document.getElementById('gov-validation-result').innerHTML = '';
      }

      async function validateGovId() {
        var country = document.getElementById('gov-country').value;
        var idType = document.getElementById('gov-id-type').value;
        var idValue = document.getElementById('gov-id-value').value.trim();
        var resultDiv = document.getElementById('gov-validation-result');

        if (!country || !idType || !idValue) {
          resultDiv.innerHTML = '<span style="color:var(--amber-bright)">Fill in all fields to validate</span>';
          return;
        }

        try {
          var res = await fetch('/v1/admin/validate/government-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country: country, id_type: idType, id_value: idValue })
          });
          var data = await res.json();
          if (data.valid) {
            resultDiv.innerHTML = '<span style="color:var(--green-bright)">\\u2713 Format valid</span>';
          } else {
            resultDiv.innerHTML = '<span style="color:var(--red-bright)">\\u2717 ' + (data.error || 'Invalid format').replace(/</g, '&lt;') + '</span>';
          }
          return data;
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:var(--red-bright)">Validation error</span>';
          return { valid: false };
        }
      }

      async function addGovernmentId() {
        var country = document.getElementById('gov-country').value;
        var idType = document.getElementById('gov-id-type').value;
        var idValue = document.getElementById('gov-id-value').value.trim();

        if (!country || !idType || !idValue) {
          showIdentityAlert('Country, ID type, and value are required', 'error');
          return;
        }

        // One government ID per country
        var existingForCountry = ownerIdentity.government_ids.find(function(g) { return g.country === country; });
        if (existingForCountry) {
          showIdentityAlert('Only one government ID is allowed per country. This owner already has an ID for ' + country + '.', 'error');
          return;
        }

        // Strict: validate format before allowing add
        var valResult = await validateGovId();
        if (!valResult || !valResult.valid) {
          showIdentityAlert('Cannot add: the ID value does not pass format validation. Please correct the value.', 'error');
          return;
        }

        var existing = ownerIdentity.government_ids.slice();
        existing.push({ country: country, id_type: idType, id_value: idValue });

        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/government-ids', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ government_ids: existing })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to add government ID');
          }
          showIdentityAlert('Government ID added. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      // ── Company ID ──

      function onCompanyTypeChange() {
        var type = document.getElementById('company-id-type').value;
        var countryGroup = document.getElementById('company-country-group');
        var valueInput = document.getElementById('company-id-value');
        var helpDiv = document.getElementById('company-id-help');

        countryGroup.style.display = (type === 'COMPANY_REG' || type === 'VAT') ? '' : 'none';

        var example = companyIdExamples[type];
        if (example) {
          valueInput.placeholder = example;
          if (type === 'VAT') helpDiv.textContent = 'Include country prefix (e.g. SE, DE, FR)';
          else if (type === 'LEI') helpDiv.textContent = '20 alphanumeric characters (ISO 17442)';
          else if (type === 'DUNS') helpDiv.textContent = '9 digits';
          else if (type === 'EORI') helpDiv.textContent = 'Country prefix + up to 15 characters';
          else helpDiv.textContent = 'Example: ' + example;
        } else {
          valueInput.placeholder = 'Enter ID value';
          helpDiv.textContent = '';
        }
        document.getElementById('company-validation-result').innerHTML = '';
      }

      async function validateCompanyId() {
        var idType = document.getElementById('company-id-type').value;
        var country = document.getElementById('company-country').value;
        var idValue = document.getElementById('company-id-value').value.trim();
        var resultDiv = document.getElementById('company-validation-result');

        if (!idType || !idValue) {
          resultDiv.innerHTML = '<span style="color:var(--amber-bright)">Fill in type and value to validate</span>';
          return;
        }

        var body = { id_type: idType, id_value: idValue };
        if (country) body.country = country;

        try {
          var res = await fetch('/v1/admin/validate/company-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          var data = await res.json();
          if (data.valid) {
            resultDiv.innerHTML = '<span style="color:var(--green-bright)">\\u2713 Format valid</span>';
          } else {
            resultDiv.innerHTML = '<span style="color:var(--red-bright)">\\u2717 ' + (data.error || 'Invalid format').replace(/</g, '&lt;') + '</span>';
          }
          return data;
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:var(--red-bright)">Validation error</span>';
          return { valid: false };
        }
      }

      async function addCompanyId() {
        var idType = document.getElementById('company-id-type').value;
        var country = document.getElementById('company-country').value;
        var idValue = document.getElementById('company-id-value').value.trim();

        if (!idType || !idValue) {
          showIdentityAlert('ID type and value are required', 'error');
          return;
        }

        if ((idType === 'COMPANY_REG' || idType === 'VAT') && !country) {
          showIdentityAlert('Country is required for ' + idType, 'error');
          return;
        }

        // Strict: validate format before allowing add
        var valResult = await validateCompanyId();
        if (!valResult || !valResult.valid) {
          showIdentityAlert('Cannot add: the ID value does not pass format validation. Please correct the value.', 'error');
          return;
        }

        var item = { id_type: idType, id_value: idValue };
        if (country) item.country = country;

        var existing = ownerIdentity.company_ids.slice();
        existing.push(item);

        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/company-ids', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_ids: existing })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to add company ID');
          }
          showIdentityAlert('Company ID added. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      // ── Signatory ──

      async function addSignatory() {
        var humanId = document.getElementById('sig-human').value;
        var role = document.getElementById('sig-role').value;
        var authority = document.getElementById('sig-authority').value;
        var scope = document.getElementById('sig-scope').value.trim();

        if (!humanId || !role || !authority) {
          showIdentityAlert('Person, role, and signing authority are required', 'error');
          return;
        }

        var item = { human_owner_principal_id: humanId, role: role, signing_authority: authority };
        if (scope) item.scope_description = scope;

        var existing = ownerIdentity.signatories.slice();
        existing.push(item);

        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/signatories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signatories: existing })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to add signatory');
          }
          showIdentityAlert('Signatory added. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      // ── Signatory Rule ──

      async function addSignatoryRule() {
        var description = document.getElementById('rule-desc').value.trim();
        var required = parseInt(document.getElementById('rule-required').value, 10);
        var rolesStr = document.getElementById('rule-roles').value.trim();
        var scope = document.getElementById('rule-scope').value.trim();

        if (!description || !required || required < 1) {
          showIdentityAlert('Description and required signatories (>= 1) are required', 'error');
          return;
        }

        var item = { description: description, required_signatories: required };
        if (rolesStr) {
          item.from_roles = rolesStr.split(',').map(function(r) { return r.trim(); }).filter(Boolean);
        }
        if (scope) item.scope_description = scope;

        var existing = ownerIdentity.signatory_rules.slice();
        existing.push(item);

        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/signatory-rules', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signatory_rules: existing })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to add signatory rule');
          }
          showIdentityAlert('Signatory rule added. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      // ── Remove functions ──

      async function removeContact(index) {
        if (!confirm('Remove this contact identity?')) return;
        var remaining = ownerIdentity.contact_identities.slice();
        remaining.splice(index, 1);
        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/contact-identities', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_identities: remaining })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to remove contact');
          }
          showIdentityAlert('Contact removed. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      async function removeGovernmentId(index) {
        if (!confirm('Remove this government ID?')) return;
        var remaining = ownerIdentity.government_ids.slice();
        remaining.splice(index, 1);
        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/government-ids', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ government_ids: remaining })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to remove government ID');
          }
          showIdentityAlert('Government ID removed. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      async function removeCompanyId(index) {
        if (!confirm('Remove this company ID?')) return;
        var remaining = ownerIdentity.company_ids.slice();
        remaining.splice(index, 1);
        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/company-ids', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_ids: remaining })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to remove company ID');
          }
          showIdentityAlert('Company ID removed. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      async function removeSignatory(index) {
        if (!confirm('Remove this signatory?')) return;
        var remaining = ownerIdentity.signatories.slice();
        remaining.splice(index, 1);
        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/signatories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signatories: remaining })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to remove signatory');
          }
          showIdentityAlert('Signatory removed. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }

      async function removeSignatoryRule(index) {
        if (!confirm('Remove this signatory rule?')) return;
        var remaining = ownerIdentity.signatory_rules.slice();
        remaining.splice(index, 1);
        try {
          var res = await fetch('/v1/admin/owners/' + ownerId + '/signatory-rules', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signatory_rules: remaining })
          });
          if (!res.ok) {
            var err = await res.json();
            throw new Error(err.error ? err.error.message : 'Failed to remove signatory rule');
          }
          showIdentityAlert('Signatory rule removed. Reloading...', 'success');
        } catch (err) {
          showIdentityAlert(err.message || String(err), 'error');
        }
      }
    </script>
  `;

  return renderPage(owner.display_name ?? 'Owner', content, '/gui/owners');
}
