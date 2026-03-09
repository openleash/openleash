import { renderPage, escapeHtml } from '../layout.js';

export interface OwnerPolicyDraftEntry {
  policy_draft_id: string;
  agent_id: string;
  agent_principal_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml: string;
  justification: string | null;
  status: string;
  resulting_policy_id: string | null;
  denial_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface OwnerPolicyDraftsOptions {
  totp_enabled?: boolean;
  require_totp?: boolean;
}

export function renderOwnerPolicyDrafts(drafts: OwnerPolicyDraftEntry[], options?: OwnerPolicyDraftsOptions): string {
  const totpEnabled = options?.totp_enabled ?? false;
  const requireTotp = options?.require_totp ?? false;
  const disableActions = requireTotp && !totpEnabled;
  const pending = drafts.filter((d) => d.status === 'PENDING');
  const resolved = drafts.filter((d) => d.status !== 'PENDING');

  const pendingRows = pending.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No pending policy drafts</td></tr>'
    : pending.map((d) => `
      <tr class="accordion-row" onclick="toggleDraft('${escapeHtml(d.policy_draft_id)}')">
        <td><span class="mono" style="font-size:12px">${escapeHtml(d.policy_draft_id.slice(0, 8))}...</span> <span class="chevron">&#9654;</span></td>
        <td>${escapeHtml(d.agent_id)}</td>
        <td>${d.applies_to_agent_principal_id
          ? `<span class="mono" style="font-size:12px">${escapeHtml(d.applies_to_agent_principal_id.slice(0, 8))}...</span>`
          : '<span style="color:var(--text-muted)">All agents</span>'}</td>
        <td>${d.justification ? escapeHtml(d.justification) : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${new Date(d.created_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="event.stopPropagation();handleDraft('${d.policy_draft_id}', 'approve')" ${disableActions ? 'disabled' : ''}>Approve</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--red-bright);color:var(--red-bright)" onclick="event.stopPropagation();handleDraft('${d.policy_draft_id}', 'deny')" ${disableActions ? 'disabled' : ''}>Deny</button>
        </td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(d.policy_draft_id)}">
        <td colspan="6" style="padding:0 12px 16px">
          <div style="margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Proposed Policy YAML</div>
          <div class="accordion-content">${escapeHtml(d.policy_yaml)}</div>
        </td>
      </tr>
    `).join('');

  const resolvedRows = resolved.length === 0
    ? ''
    : resolved.map((d) => {
      const badge = d.status === 'APPROVED' ? 'badge-green' : d.status === 'DENIED' ? 'badge-red' : 'badge-muted';
      return `
      <tr class="accordion-row" onclick="toggleDraft('${escapeHtml(d.policy_draft_id)}')">
        <td><span class="mono" style="font-size:12px">${escapeHtml(d.policy_draft_id.slice(0, 8))}...</span> <span class="chevron">&#9654;</span></td>
        <td>${escapeHtml(d.agent_id)}</td>
        <td><span class="badge ${badge}">${escapeHtml(d.status)}</span></td>
        <td>${d.resulting_policy_id
          ? `<span class="mono" style="font-size:11px">${escapeHtml(d.resulting_policy_id.slice(0, 8))}...</span>`
          : d.denial_reason ? escapeHtml(d.denial_reason) : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${new Date(d.created_at).toLocaleString()}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(d.policy_draft_id)}">
        <td colspan="5" style="padding:0 12px 16px">
          <div style="margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Proposed Policy YAML</div>
          <div class="accordion-content">${escapeHtml(d.policy_yaml)}</div>
        </td>
      </tr>`;
    }).join('');

  const totpBanner = requireTotp && !totpEnabled
    ? '<div class="alert alert-error" style="margin-top:16px">Two-factor authentication is required. <a href="/gui/owner/profile" style="color:inherit;text-decoration:underline">Set up 2FA in your Profile.</a></div>'
    : '';

  const content = `
    <h2>Policy Drafts</h2>
    <p style="color:var(--text-secondary);font-size:13px;margin-top:4px;margin-bottom:8px">
      Your agents can propose new policies. Review and approve or deny them here.
    </p>
    ${totpBanner}

    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Pending</h3>
      <table>
        <thead>
          <tr><th>ID</th><th>Agent</th><th>Applies To</th><th>Justification</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>

    ${resolved.length > 0 ? `
    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Resolved</h3>
      <table>
        <thead>
          <tr><th>ID</th><th>Agent</th><th>Status</th><th>Result</th><th>Created</th></tr>
        </thead>
        <tbody>${resolvedRows}</tbody>
      </table>
    </div>` : ''}

    <div id="resultMsg" class="alert" style="display:none;margin-top:16px"></div>

    <script>
      var totpEnabled = ${totpEnabled};

      function toggleDraft(id) {
        var detail = document.getElementById('detail-' + id);
        var row = detail.previousElementSibling;
        detail.classList.toggle('open');
        row.classList.toggle('expanded');
      }

      async function handleDraft(id, action) {
        var token = sessionStorage.getItem('openleash_session');
        var bodyObj = {};
        if (action === 'deny') {
          bodyObj.reason = prompt('Reason for denial (optional):') || undefined;
        }
        if (totpEnabled) {
          var code = prompt('Enter your 2FA code:');
          if (!code) return;
          bodyObj.totp_code = code;
        }
        var body = JSON.stringify(bodyObj);
        try {
          var res = await fetch('/v1/owner/policy-drafts/' + id + '/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: body,
          });
          if (res.ok) {
            window.location.reload();
          } else {
            var data = await res.json();
            var el = document.getElementById('resultMsg');
            el.className = 'alert alert-error';
            el.textContent = data.error?.message || 'Failed';
            el.style.display = 'block';
          }
        } catch (err) {
          alert('Network error');
        }
      }
    </script>
  `;
  return renderPage('Policy Drafts', content, '/gui/owner/policy-drafts', 'owner');
}
