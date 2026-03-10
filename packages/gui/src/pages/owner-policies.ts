import { renderPage, escapeHtml, copyableId } from '../layout.js';

export interface OwnerPolicyEntry {
  policy_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml?: string;
}

export function renderOwnerPolicies(policies: OwnerPolicyEntry[]): string {
  const rows = policies.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px">No policies</td></tr>'
    : policies.map((p) => `
      <tr id="policy-row-${escapeHtml(p.policy_id)}">
        <td>${copyableId(p.policy_id)}</td>
        <td>${p.applies_to_agent_principal_id
          ? copyableId(p.applies_to_agent_principal_id)
          : '<span style="color:var(--text-muted)">All agents</span>'}</td>
        <td>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px" onclick="toggleEditor('${escapeHtml(p.policy_id)}')">Edit</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--red-bright);color:var(--red-bright)" onclick="deletePolicy('${escapeHtml(p.policy_id)}')">Delete</button>
        </td>
      </tr>
      <tr id="editor-row-${escapeHtml(p.policy_id)}" class="hidden">
        <td colspan="3" style="padding:12px 16px;background:var(--bg-elevated)">
          <div id="editor-status-${escapeHtml(p.policy_id)}"></div>
          <textarea id="editor-yaml-${escapeHtml(p.policy_id)}" class="yaml-editor" style="width:100%;height:240px;margin-bottom:8px;font-size:13px">${escapeHtml(p.policy_yaml ?? '')}</textarea>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="savePolicy('${escapeHtml(p.policy_id)}')">Save</button>
            <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px" onclick="toggleEditor('${escapeHtml(p.policy_id)}')">Cancel</button>
          </div>
        </td>
      </tr>
    `).join('');

  const content = `
    <h2>My Policies</h2>
    <div class="card" style="padding:0;margin-top:20px">
      <table>
        <thead>
          <tr><th>Policy ID</th><th>Applies To</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="card" style="padding:20px;margin-top:20px">
      <h3 style="margin-bottom:12px">Create Policy</h3>
      <div class="form-group" style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">Agent Principal ID (optional)</label>
        <input type="text" id="agentId" placeholder="Leave empty for all agents" style="width:100%;padding:8px 12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">Policy YAML</label>
        <textarea id="policyYaml" class="yaml-editor" style="width:100%;height:200px;padding:12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:13px;resize:vertical">version: 1
default: deny
rules:
  - id: allow_read
    effect: allow
    action: read</textarea>
      </div>
      <button class="btn btn-primary" onclick="createPolicy()">Create Policy</button>
      <div id="resultMsg" class="alert" style="display:none;margin-top:12px"></div>
    </div>

    <script>
      var token = sessionStorage.getItem('openleash_session');

      function toggleEditor(policyId) {
        var editorRow = document.getElementById('editor-row-' + policyId);
        editorRow.classList.toggle('hidden');
      }

      async function savePolicy(policyId) {
        var yaml = document.getElementById('editor-yaml-' + policyId).value;
        var statusDiv = document.getElementById('editor-status-' + policyId);
        statusDiv.innerHTML = '';

        var res = await fetch('/v1/owner/policies/' + policyId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ policy_yaml: yaml }),
        });

        if (res.ok) {
          statusDiv.innerHTML = '<div class="alert alert-success" style="margin-bottom:8px">Policy saved</div>';
          setTimeout(function() { statusDiv.innerHTML = ''; }, 3000);
        } else {
          var data = await res.json();
          statusDiv.innerHTML = '<div class="alert alert-error" style="margin-bottom:8px">' + (data.error?.message || 'Failed to save').replace(/</g, '&lt;') + '</div>';
        }
      }

      async function deletePolicy(id) {
        if (!confirm('Are you sure you want to delete this policy?')) return;
        var res = await fetch('/v1/owner/policies/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token },
        });
        if (res.ok) window.location.reload();
        else alert('Failed to delete policy');
      }

      async function createPolicy() {
        var agentId = document.getElementById('agentId').value.trim() || null;
        var yaml = document.getElementById('policyYaml').value;
        var res = await fetch('/v1/owner/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ policy_yaml: yaml, applies_to_agent_principal_id: agentId }),
        });
        if (res.ok) window.location.reload();
        else {
          var data = await res.json();
          var el = document.getElementById('resultMsg');
          el.className = 'alert alert-error';
          el.textContent = data.error?.message || 'Failed';
          el.style.display = 'block';
        }
      }
    </script>
  `;
  return renderPage('My Policies', content, '/gui/owner/policies', 'owner');
}
