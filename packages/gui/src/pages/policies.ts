import { renderPage, escapeHtml } from '../layout.js';

export interface PolicyListEntry {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml?: string;
  error?: string;
}

export function renderPolicies(policies: PolicyListEntry[]): string {
  const rows = policies.map((p) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(p.policy_id)}">
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.policy_id.slice(0, 8))}...</a>
      </td>
      <td class="mono truncate" title="${escapeHtml(p.owner_principal_id)}">${escapeHtml(p.owner_principal_id.slice(0, 8))}...</td>
      <td class="mono">${p.applies_to_agent_principal_id ? escapeHtml(p.applies_to_agent_principal_id.slice(0, 8)) + '...' : '<span style="color:var(--text-muted)">all agents</span>'}</td>
      <td>
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="btn btn-secondary" style="padding:4px 10px;font-size:12px">Edit</a>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header">
      <h2>Policies</h2>
      <p>${policies.length} configured polic${policies.length !== 1 ? 'ies' : 'y'}</p>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Policy ID</th>
            <th>Owner</th>
            <th>Applies To</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">No policies configured</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return renderPage('Policies', content, '/gui/policies');
}

export interface PolicyDetail {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml: string;
}

export function renderPolicyEditor(policy: PolicyDetail): string {
  const content = `
    <div class="page-header">
      <h2>Edit Policy</h2>
      <p class="mono">${escapeHtml(policy.policy_id)}</p>
    </div>

    <div id="alert-container"></div>

    <div class="card">
      <div class="card-title">Policy Details</div>
      <table style="margin-bottom:20px">
        <tbody>
          <tr>
            <td style="width:160px;color:var(--text-muted)">Owner</td>
            <td class="mono">${escapeHtml(policy.owner_principal_id)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Applies To</td>
            <td class="mono">${policy.applies_to_agent_principal_id ? escapeHtml(policy.applies_to_agent_principal_id) : 'All agents'}</td>
          </tr>
        </tbody>
      </table>

      <div class="card-title">Policy YAML</div>
      <textarea id="policy-yaml" class="yaml-editor">${escapeHtml(policy.policy_yaml)}</textarea>

      <div class="toolbar" style="margin-top:16px">
        <button id="save-btn" class="btn btn-primary" onclick="savePolicy()">Save Policy</button>
        <a href="/gui/policies" class="btn btn-secondary">Back to List</a>
        <span id="save-status" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
    </div>

    <script>
      async function savePolicy() {
        const btn = document.getElementById('save-btn');
        const status = document.getElementById('save-status');
        const alertContainer = document.getElementById('alert-container');
        const yaml = document.getElementById('policy-yaml').value;

        btn.disabled = true;
        btn.textContent = 'Saving...';
        alertContainer.innerHTML = '';

        try {
          const res = await fetch('/v1/admin/policies/${escapeHtml(policy.policy_id)}', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy_yaml: yaml }),
          });

          const data = await res.json();

          if (!res.ok) {
            const msg = data.error?.message || 'Failed to save';
            alertContainer.innerHTML = '<div class="alert alert-error">' + msg.replace(/</g, '&lt;') + '</div>';
          } else {
            alertContainer.innerHTML = '<div class="alert alert-success">Policy saved successfully</div>';
            setTimeout(() => { alertContainer.innerHTML = ''; }, 3000);
          }
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">Network error: ' + String(err).replace(/</g, '&lt;') + '</div>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Save Policy';
        }
      }
    </script>
  `;

  return renderPage('Edit Policy', content, '/gui/policies');
}
