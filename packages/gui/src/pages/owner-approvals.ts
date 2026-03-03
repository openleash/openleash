import { renderPage, escapeHtml } from '../layout.js';

export interface OwnerApprovalEntry {
  approval_request_id: string;
  agent_id: string;
  action_type: string;
  justification: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

export function renderOwnerApprovals(approvals: OwnerApprovalEntry[]): string {
  const pending = approvals.filter((a) => a.status === 'PENDING');
  const resolved = approvals.filter((a) => a.status !== 'PENDING');

  const pendingRows = pending.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No pending approvals</td></tr>'
    : pending.map((a) => `
      <tr>
        <td><span class="mono" style="font-size:12px">${escapeHtml(a.approval_request_id.slice(0, 8))}...</span></td>
        <td>${escapeHtml(a.agent_id)}</td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span></td>
        <td>${a.justification ? escapeHtml(a.justification) : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${new Date(a.created_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="handleApproval('${a.approval_request_id}', 'approve')">Approve</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--red-bright);color:var(--red-bright)" onclick="handleApproval('${a.approval_request_id}', 'deny')">Deny</button>
        </td>
      </tr>
    `).join('');

  const resolvedRows = resolved.length === 0
    ? ''
    : resolved.map((a) => {
      const badge = a.status === 'APPROVED' ? 'badge-green' : a.status === 'DENIED' ? 'badge-red' : 'badge-muted';
      return `
      <tr>
        <td><span class="mono" style="font-size:12px">${escapeHtml(a.approval_request_id.slice(0, 8))}...</span></td>
        <td>${escapeHtml(a.agent_id)}</td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span></td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${new Date(a.created_at).toLocaleString()}</td>
      </tr>`;
    }).join('');

  const content = `
    <h2>Approval Requests</h2>

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
      async function handleApproval(id, action) {
        const token = sessionStorage.getItem('openleash_session');
        const body = action === 'deny' ? JSON.stringify({ reason: prompt('Reason for denial (optional):') || undefined }) : '{}';
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
          alert('Network error');
        }
      }
    </script>
  `;
  return renderPage('Approvals', content, '/gui/owner/approvals', 'owner');
}
