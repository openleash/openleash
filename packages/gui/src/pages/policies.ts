import { renderPage, escapeHtml } from '../layout.js';

export interface PolicyListEntry {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml?: string;
  error?: string;
}

export interface OwnerOption {
  owner_principal_id: string;
  display_name: string;
}

export interface AgentOption {
  agent_principal_id: string;
  agent_id: string;
  owner_principal_id: string;
}

export interface BindingEntry {
  owner_principal_id: string;
  policy_id: string;
  applies_to_agent_principal_id: string | null;
}

export function renderPolicies(policies: PolicyListEntry[], owners?: OwnerOption[], agents?: AgentOption[]): string {
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

  const ownerOptions = (owners ?? []).map((o) =>
    `<option value="${escapeHtml(o.owner_principal_id)}">${escapeHtml(o.display_name)} (${escapeHtml(o.owner_principal_id.slice(0, 8))}...)</option>`
  ).join('');

  const agentOptions = (agents ?? []).map((a) =>
    `<option value="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_id)} (${escapeHtml(a.agent_principal_id.slice(0, 8))}...)</option>`
  ).join('');

  const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>Policies</h2>
        <p>${policies.length} configured polic${policies.length !== 1 ? 'ies' : 'y'}</p>
      </div>
      <button class="btn btn-primary" onclick="toggleForm()">+ Create Policy</button>
    </div>

    <div id="alert-container"></div>

    <div id="policy-form" class="card hidden">
      <div class="card-title">Create New Policy</div>

      <div class="form-group">
        <label for="owner-select">Owner</label>
        <select id="owner-select" class="form-select">
          <option value="" disabled selected>Select an owner</option>
          ${ownerOptions}
        </select>
      </div>

      <div class="form-group">
        <label for="agent-select">Applies To Agent</label>
        <select id="agent-select" class="form-select">
          <option value="">All agents for this owner</option>
          ${agentOptions}
        </select>
        <div class="form-help">Leave as "All agents" to apply this policy to every agent under the selected owner</div>
      </div>

      <div class="form-group">
        <label for="create-yaml">Policy YAML</label>
        <textarea id="create-yaml" class="yaml-editor" style="min-height:200px">version: 1
default: deny
rules:
  - id: example_rule
    effect: allow
    action: "*"
    description: "Allow all actions (replace with your rules)"</textarea>
      </div>

      <div class="toolbar">
        <button id="create-btn" class="btn btn-primary" onclick="createPolicy()">Create Policy</button>
        <button class="btn btn-secondary" onclick="toggleForm()">Cancel</button>
      </div>
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

    <script>
      function toggleForm() {
        document.getElementById('policy-form').classList.toggle('hidden');
      }

      async function createPolicy() {
        const ownerSelect = document.getElementById('owner-select');
        const agentSelect = document.getElementById('agent-select');
        const yamlArea = document.getElementById('create-yaml');
        const btn = document.getElementById('create-btn');
        const alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        const ownerId = ownerSelect.value;
        const agentId = agentSelect.value || null;
        const yaml = yamlArea.value;

        if (!ownerId) {
          alertContainer.innerHTML = '<div class="alert alert-error">Please select an owner</div>';
          return;
        }
        if (!yaml.trim()) {
          alertContainer.innerHTML = '<div class="alert alert-error">Policy YAML is required</div>';
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
          const res = await fetch('/v1/admin/policies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner_principal_id: ownerId,
              applies_to_agent_principal_id: agentId,
              policy_yaml: yaml,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error?.message || 'Failed to create policy');
          }

          alertContainer.innerHTML = '<div class="alert alert-success">Policy created (ID: ' + data.policy_id.slice(0, 8).replace(/</g, '&lt;') + '...). Reloading...</div>';
          setTimeout(function() { window.location.reload(); }, 1000);
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">' + String(err.message || err).replace(/</g, '&lt;') + '</div>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Create Policy';
        }
      }
    </script>
  `;

  return renderPage('Policies', content, '/gui/policies');
}

export interface PolicyDetail {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml: string;
}

export function renderPolicyEditor(policy: PolicyDetail, bindings?: BindingEntry[]): string {
  const policyBindings = (bindings ?? []).filter((b) => b.policy_id === policy.policy_id);
  const bindingCount = policyBindings.length;

  const bindingRows = policyBindings.map((b) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(b.owner_principal_id)}">${escapeHtml(b.owner_principal_id.slice(0, 8))}...</td>
      <td class="mono">${b.applies_to_agent_principal_id ? escapeHtml(b.applies_to_agent_principal_id.slice(0, 8)) + '...' : '<span style="color:var(--text-muted)">all agents</span>'}</td>
    </tr>
  `).join('');

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

    <div class="card">
      <div class="card-title">Bindings (${bindingCount})</div>
      ${bindingCount > 0 ? `
      <table style="margin-bottom:16px">
        <thead>
          <tr>
            <th>Owner</th>
            <th>Applies To</th>
          </tr>
        </thead>
        <tbody>${bindingRows}</tbody>
      </table>
      <button class="btn btn-secondary" style="border-color:var(--amber-mid);color:var(--amber-bright)" onclick="unbindPolicy()">Unbind All (${bindingCount})</button>
      ` : '<p style="color:var(--text-muted);padding:8px 0;margin-bottom:16px">No active bindings for this policy</p>'}
    </div>

    <div class="card" style="border-color:rgba(239,68,68,0.3)">
      <div class="card-title" style="color:var(--red,#ef4444)">Danger Zone</div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
        Deleting a policy removes the YAML file, the state entry, and all bindings.
        This action cannot be undone.
      </p>
      <button class="btn btn-secondary" style="border-color:rgba(239,68,68,0.5);color:#ef4444" onclick="deletePolicy()">Delete Policy</button>
    </div>

    <script>
      async function savePolicy() {
        var btn = document.getElementById('save-btn');
        var alertContainer = document.getElementById('alert-container');
        var yaml = document.getElementById('policy-yaml').value;

        btn.disabled = true;
        btn.textContent = 'Saving...';
        alertContainer.innerHTML = '';

        try {
          var res = await fetch('/v1/admin/policies/${escapeHtml(policy.policy_id)}', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy_yaml: yaml }),
          });

          var data = await res.json();

          if (!res.ok) {
            var msg = data.error?.message || 'Failed to save';
            alertContainer.innerHTML = '<div class="alert alert-error">' + msg.replace(/</g, '&lt;') + '</div>';
          } else {
            alertContainer.innerHTML = '<div class="alert alert-success">Policy saved successfully</div>';
            setTimeout(function() { alertContainer.innerHTML = ''; }, 3000);
          }
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">Network error: ' + String(err).replace(/</g, '&lt;') + '</div>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Save Policy';
        }
      }

      async function deletePolicy() {
        if (!confirm('Are you sure you want to delete this policy? This will remove the policy file and all its bindings. This cannot be undone.')) {
          return;
        }

        var alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        try {
          var res = await fetch('/v1/admin/policies/${escapeHtml(policy.policy_id)}', {
            method: 'DELETE',
          });

          var data = await res.json();

          if (!res.ok) {
            var msg = data.error?.message || 'Failed to delete';
            alertContainer.innerHTML = '<div class="alert alert-error">' + msg.replace(/</g, '&lt;') + '</div>';
          } else {
            alertContainer.innerHTML = '<div class="alert alert-success">Policy deleted. Redirecting...</div>';
            setTimeout(function() { window.location.href = '/gui/policies'; }, 1000);
          }
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">Network error: ' + String(err).replace(/</g, '&lt;') + '</div>';
        }
      }

      async function unbindPolicy() {
        if (!confirm('Remove all bindings for this policy? The policy file will be kept but it will no longer be evaluated for any agent.')) {
          return;
        }

        var alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        try {
          var res = await fetch('/v1/admin/policies/${escapeHtml(policy.policy_id)}/unbind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });

          var data = await res.json();

          if (!res.ok) {
            var msg = data.error?.message || 'Failed to unbind';
            alertContainer.innerHTML = '<div class="alert alert-error">' + msg.replace(/</g, '&lt;') + '</div>';
          } else {
            alertContainer.innerHTML = '<div class="alert alert-success">' + data.bindings_removed + ' binding(s) removed. Reloading...</div>';
            setTimeout(function() { window.location.reload(); }, 1000);
          }
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">Network error: ' + String(err).replace(/</g, '&lt;') + '</div>';
        }
      }
    </script>
  `;

  return renderPage('Edit Policy', content, '/gui/policies');
}
