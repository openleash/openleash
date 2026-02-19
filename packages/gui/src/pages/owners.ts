import { renderPage, escapeHtml } from '../layout.js';

export interface OwnerData {
  owner_principal_id: string;
  principal_type?: string;
  display_name?: string;
  status?: string;
  attributes?: Record<string, unknown>;
  created_at?: string;
  error?: string;
}

export interface OwnerDetailData {
  owner: OwnerData;
  agents: { agent_id: string; agent_principal_id: string; status: string; created_at: string }[];
  policies: { policy_id: string; applies_to_agent_principal_id: string | null }[];
  audit: { event_id: string; timestamp: string; event_type: string; metadata_json: Record<string, unknown> }[];
}

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

export function renderOwnerDetail(data: OwnerDetailData): string {
  const { owner, agents, policies, audit } = data;

  const agentRows = agents.map((a) => `
    <tr>
      <td class="mono">${escapeHtml(a.agent_id)}</td>
      <td class="mono truncate" title="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_principal_id.slice(0, 8))}...</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${escapeHtml(a.created_at.slice(0, 10))}</td>
    </tr>
  `).join('');

  const policyRows = policies.map((p) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(p.policy_id)}">
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.policy_id.slice(0, 8))}...</a>
      </td>
      <td class="mono">${p.applies_to_agent_principal_id ? escapeHtml(p.applies_to_agent_principal_id.slice(0, 8)) + '...' : '<span style="color:var(--text-muted)">all agents</span>'}</td>
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

  const content = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
        <h2>${escapeHtml(owner.display_name ?? 'Owner')}</h2>
        ${statusBadge(owner.status)}
      </div>
      <p class="mono">${escapeHtml(owner.owner_principal_id)}</p>
    </div>

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
      function toggleAccordion(idx) {
        const row = document.getElementById('row-' + idx);
        const detail = document.getElementById('detail-' + idx);
        const isOpen = detail.classList.contains('open');
        if (isOpen) {
          detail.classList.remove('open');
          row.classList.remove('expanded');
        } else {
          detail.classList.add('open');
          row.classList.add('expanded');
        }
      }
    </script>
  `;

  return renderPage(owner.display_name ?? 'Owner', content, '/gui/owners');
}
