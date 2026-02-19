import { renderPage, escapeHtml } from '../layout.js';

export interface AuditEntry {
  event_id: string;
  timestamp: string;
  event_type: string;
  principal_id: string | null;
  action_id: string | null;
  decision_id: string | null;
  metadata_json: Record<string, unknown>;
}

export interface AuditData {
  items: AuditEntry[];
  next_cursor: string | null;
}

function eventBadge(type: string): string {
  if (type.includes('CREATED') || type.includes('REGISTERED') || type.includes('STARTED')) {
    return `<span class="badge badge-green">${escapeHtml(type)}</span>`;
  }
  if (type.includes('DENY') || type.includes('REVOKED') || type.includes('ERROR')) {
    return `<span class="badge badge-red">${escapeHtml(type)}</span>`;
  }
  if (type.includes('UPSERTED') || type.includes('ROTATED')) {
    return `<span class="badge badge-amber">${escapeHtml(type)}</span>`;
  }
  return `<span class="badge badge-muted">${escapeHtml(type)}</span>`;
}

export function renderAudit(data: AuditData, cursor: number): string {
  const rows = data.items.map((e) => `
    <tr>
      <td class="mono" style="white-space:nowrap">${escapeHtml(e.timestamp.slice(0, 19).replace('T', ' '))}</td>
      <td>${eventBadge(e.event_type)}</td>
      <td class="mono truncate" title="${escapeHtml(e.principal_id ?? '')}">${e.principal_id ? escapeHtml(e.principal_id.slice(0, 8)) + '...' : '-'}</td>
      <td class="mono" style="font-size:11px;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(JSON.stringify(e.metadata_json))}</td>
    </tr>
  `).join('');

  const nextCursor = data.next_cursor;
  const loadMoreHtml = nextCursor
    ? `<div style="text-align:center;margin-top:16px"><a href="/gui/audit?cursor=${escapeHtml(nextCursor)}" class="btn btn-secondary">Load More</a></div>`
    : '';

  const content = `
    <div class="page-header">
      <h2>Audit Log</h2>
      <p>Authorization events${cursor > 0 ? ` (from offset ${cursor})` : ''}</p>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Event</th>
            <th>Principal</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">No audit events</td></tr>'}
        </tbody>
      </table>
      ${loadMoreHtml}
    </div>
  `;

  return renderPage('Audit Log', content, '/gui/audit');
}
