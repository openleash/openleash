import { renderPage, escapeHtml } from '../layout.js';

export interface OwnerData {
  owner_principal_id: string;
  principal_type?: string;
  display_name?: string;
  status?: string;
  created_at?: string;
  error?: string;
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

export function renderOwners(owners: OwnerData[]): string {
  const rows = owners.map((o) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(o.owner_principal_id)}">${escapeHtml(o.owner_principal_id.slice(0, 8))}...</td>
      <td>${escapeHtml(o.display_name ?? '-')}</td>
      <td>${escapeHtml(o.principal_type ?? '-')}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="mono">${escapeHtml(o.created_at?.slice(0, 10) ?? '-')}</td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header">
      <h2>Owners</h2>
      <p>${owners.length} registered owner${owners.length !== 1 ? 's' : ''}</p>
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
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:24px">No owners registered</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return renderPage('Owners', content, '/gui/owners');
}
