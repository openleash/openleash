import { renderPage } from '../layout.js';

export function renderOwnerPolicyCreate(): string {
  const content = `
    <h2>Create Policy</h2>

    <div class="card" style="padding:20px;margin-top:20px">
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
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="createPolicy()">Create Policy</button>
        <a href="/gui/owner/policies" class="btn btn-secondary" style="text-decoration:none">Cancel</a>
      </div>
      <div id="resultMsg" class="alert" style="display:none;margin-top:12px"></div>
    </div>

    <script>
      var token = sessionStorage.getItem('openleash_session');

      async function createPolicy() {
        var agentId = document.getElementById('agentId').value.trim() || null;
        var yaml = document.getElementById('policyYaml').value;
        var res = await fetch('/v1/owner/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ policy_yaml: yaml, applies_to_agent_principal_id: agentId }),
        });
        if (res.ok) {
          window.location.href = '/gui/owner/policies';
        } else {
          var data = await res.json();
          var el = document.getElementById('resultMsg');
          el.className = 'alert alert-error';
          el.textContent = data.error?.message || 'Failed';
          el.style.display = 'block';
        }
      }
    </script>
  `;
  return renderPage('Create Policy', content, '/gui/owner/policies', 'owner');
}
