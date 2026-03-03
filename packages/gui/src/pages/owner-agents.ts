import { renderPage, escapeHtml } from '../layout.js';

export interface OwnerAgentEntry {
  agent_principal_id: string;
  agent_id: string;
  status: string;
  created_at: string;
  revoked_at: string | null;
}

export function renderOwnerAgents(agents: OwnerAgentEntry[]): string {
  const rows = agents.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No agents registered</td></tr>'
    : agents.map((a) => {
      const badge = a.status === 'ACTIVE' ? 'badge-green' : 'badge-red';
      return `
      <tr>
        <td>${escapeHtml(a.agent_id)}</td>
        <td><span class="mono" style="font-size:12px">${escapeHtml(a.agent_principal_id.slice(0, 8))}...</span></td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${new Date(a.created_at).toLocaleString()}</td>
        <td>
          ${a.status === 'ACTIVE'
            ? `<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;border-color:var(--red-bright);color:var(--red-bright)" onclick="revokeAgent('${a.agent_principal_id}')">Revoke</button>`
            : '<span style="color:var(--text-muted)">-</span>'}
        </td>
      </tr>`;
    }).join('');

  const content = `
    <h2>My Agents</h2>
    <div class="card" style="padding:0;margin-top:20px">
      <table>
        <thead>
          <tr><th>Agent ID</th><th>Principal ID</th><th>Status</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>
      async function revokeAgent(principalId) {
        if (!confirm('Are you sure you want to revoke this agent?')) return;
        const token = sessionStorage.getItem('openleash_session');
        const res = await fetch('/v1/owner/agents/' + principalId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ status: 'REVOKED' }),
        });
        if (res.ok) window.location.reload();
        else alert('Failed to revoke agent');
      }
    </script>
  `;
  return renderPage('My Agents', content, '/gui/owner/agents', 'owner');
}
