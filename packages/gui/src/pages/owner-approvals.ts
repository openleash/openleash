import { renderPage, escapeHtml, copyableId } from '../layout.js';

export interface OwnerApprovalEntry {
  approval_request_id: string;
  agent_id: string;
  action_type: string;
  justification: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface OwnerApprovalsOptions {
  totp_enabled?: boolean;
  require_totp?: boolean;
}

export function renderOwnerApprovals(approvals: OwnerApprovalEntry[], options?: OwnerApprovalsOptions): string {
  const totpEnabled = options?.totp_enabled ?? false;
  const requireTotp = options?.require_totp ?? false;
  const pending = approvals.filter((a) => a.status === 'PENDING');
  const resolved = approvals.filter((a) => a.status !== 'PENDING');

  const pendingRows = pending.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No pending approvals</td></tr>'
    : pending.map((a) => `
      <tr>
        <td>${copyableId(a.approval_request_id)}</td>
        <td>${copyableId(a.agent_id, a.agent_id.length)}</td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith('communication.') ? ' <span class="badge badge-muted" style="margin-left:4px;font-size:10px">MCP Glove</span>' : ''}</td>
        <td>${a.justification ? escapeHtml(a.justification) : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${new Date(a.created_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="handleApproval('${a.approval_request_id}', 'approve')" ${disableActions ? 'disabled' : ''}>Approve</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--red-bright);color:var(--red-bright)" onclick="handleApproval('${a.approval_request_id}', 'deny')" ${disableActions ? 'disabled' : ''}>Deny</button>
        </td>
      </tr>
    `).join('');

  const resolvedRows = resolved.length === 0
    ? ''
    : resolved.map((a) => {
      const badge = a.status === 'APPROVED' ? 'badge-green' : a.status === 'DENIED' ? 'badge-red' : 'badge-muted';
      return `
      <tr>
        <td>${copyableId(a.approval_request_id)}</td>
        <td>${copyableId(a.agent_id, a.agent_id.length)}</td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith('communication.') ? ' <span class="badge badge-muted" style="margin-left:4px;font-size:10px">MCP Glove</span>' : ''}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${new Date(a.created_at).toLocaleString()}</td>
      </tr>`;
    }).join('');

  const totpBanner = requireTotp && !totpEnabled
    ? '<div class="alert alert-error" style="margin-top:16px">Two-factor authentication is required. <a href="/gui/owner/profile" style="color:inherit;text-decoration:underline">Set up 2FA in your Profile.</a></div>'
    : '';

  const disableActions = requireTotp && !totpEnabled;

  const content = `
    <h2>Approval Requests</h2>
    ${totpBanner}

    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Pending</h3>
      <table>
        <thead>
          <tr><th>ID</th><th>Agent</th><th>Action</th><th>Justification</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>

    ${resolved.length > 0 ? `
    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Resolved</h3>
      <table>
        <thead>
          <tr><th>ID</th><th>Agent</th><th>Action</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>${resolvedRows}</tbody>
      </table>
    </div>` : ''}

    <div id="resultMsg" class="alert" style="display:none;margin-top:16px"></div>

    <script>
      var totpEnabled = ${totpEnabled};

      async function handleApproval(id, action) {
        const token = sessionStorage.getItem('openleash_session');
        var bodyObj = {};
        if (action === 'deny') {
          var reason = await olPrompt('Reason for denial (optional):', 'Enter reason...', 'Deny Request');
          if (reason === null) return;
          if (reason) bodyObj.reason = reason;
        }
        if (totpEnabled) {
          var code = await olPrompt('Enter your 2FA code:', '000000', 'Two-Factor Authentication');
          if (!code) return;
          bodyObj.totp_code = code;
        }
        const body = JSON.stringify(bodyObj);
        try {
          const res = await fetch('/v1/owner/approval-requests/' + id + '/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: body,
          });
          if (res.ok) {
            window.location.reload();
          } else {
            const data = await res.json();
            const el = document.getElementById('resultMsg');
            el.className = 'alert alert-error';
            el.textContent = data.error?.message || 'Failed';
            el.style.display = 'block';
          }
        } catch (err) {
          olAlert('Network error', 'Error');
        }
      }
    </script>
  `;
  return renderPage('Approvals', content, '/gui/owner/approvals', 'owner');
}
