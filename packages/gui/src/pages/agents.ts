import { renderPage, escapeHtml } from '../layout.js';

export interface AgentData {
  agent_principal_id: string;
  agent_id?: string;
  owner_principal_id?: string;
  status?: string;
  created_at?: string;
  revoked_at?: string | null;
  error?: string;
}

function statusBadge(status?: string): string {
  if (!status) return '<span class="badge badge-muted">UNKNOWN</span>';
  switch (status) {
    case 'ACTIVE': return '<span class="badge badge-green">ACTIVE</span>';
    case 'REVOKED': return '<span class="badge badge-red">REVOKED</span>';
    default: return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
  }
}

export function renderAgents(agents: AgentData[]): string {
  const rows = agents.map((a) => `
    <tr>
      <td class="mono">${escapeHtml(a.agent_id ?? '-')}</td>
      <td class="mono truncate" title="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_principal_id.slice(0, 8))}...</td>
      <td class="mono truncate" title="${escapeHtml(a.owner_principal_id ?? '')}">${escapeHtml((a.owner_principal_id ?? '-').slice(0, 8))}${a.owner_principal_id ? '...' : ''}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${escapeHtml(a.created_at?.slice(0, 10) ?? '-')}</td>
      <td class="mono">${a.revoked_at ? escapeHtml(a.revoked_at.slice(0, 10)) : '-'}</td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header">
      <h2>Agents</h2>
      <p>${agents.length} registered agent${agents.length !== 1 ? 's' : ''}</p>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Principal ID</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Created</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">No agents registered</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return renderPage('Agents', content, '/gui/agents');
}
