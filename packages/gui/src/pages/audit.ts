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

function formatMetadata(meta: Record<string, unknown>): string {
  const entries = Object.entries(meta);
  if (entries.length === 0) return '<span style="color:var(--text-muted)">No metadata</span>';

  return entries.map(([key, val]) => {
    const valStr = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
    return `<div style="margin-bottom:6px"><span style="color:var(--green-bright)">${escapeHtml(key)}</span>: <span style="color:var(--text-primary)">${escapeHtml(valStr)}</span></div>`;
  }).join('');
}

export function renderAudit(data: AuditData, cursor: number): string {
  // Reverse to show newest first
  const items = [...data.items].reverse();

  const rows = items.map((e, i) => {
    const idx = cursor + data.items.length - 1 - i;
    const hasExtra = e.principal_id || e.action_id || e.decision_id || Object.keys(e.metadata_json).length > 0;

    const extraFields: string[] = [];
    if (e.principal_id) extraFields.push(`<div style="margin-bottom:6px"><span style="color:var(--green-bright)">principal_id</span>: <span style="color:var(--text-primary)">${escapeHtml(e.principal_id)}</span></div>`);
    if (e.action_id) extraFields.push(`<div style="margin-bottom:6px"><span style="color:var(--green-bright)">action_id</span>: <span style="color:var(--text-primary)">${escapeHtml(e.action_id)}</span></div>`);
    if (e.decision_id) extraFields.push(`<div style="margin-bottom:6px"><span style="color:var(--green-bright)">decision_id</span>: <span style="color:var(--text-primary)">${escapeHtml(e.decision_id)}</span></div>`);

    return `
      <tr class="accordion-row" onclick="toggleAccordion(${idx})" id="row-${idx}">
        <td style="width:20px"><span class="chevron">&#9654;</span></td>
        <td class="mono" style="white-space:nowrap">${escapeHtml(e.timestamp.slice(0, 19).replace('T', ' '))}</td>
        <td>${eventBadge(e.event_type)}</td>
        <td class="mono truncate" title="${escapeHtml(e.event_id)}">${escapeHtml(e.event_id.slice(0, 8))}...</td>
      </tr>
      <tr class="accordion-detail" id="detail-${idx}">
        <td colspan="4">
          <div class="accordion-content">
            ${extraFields.join('')}
            ${formatMetadata(e.metadata_json)}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const nextCursor = data.next_cursor;
  const loadMoreHtml = nextCursor
    ? `<div style="text-align:center;margin-top:16px"><a href="/gui/audit?cursor=${escapeHtml(nextCursor)}" class="btn btn-secondary">Load More</a></div>`
    : '';

  const content = `
    <div class="page-header">
      <h2>Audit Log</h2>
      <p>Authorization events, newest first${cursor > 0 ? ` (from offset ${cursor})` : ''}</p>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:20px"></th>
            <th>Timestamp</th>
            <th>Event</th>
            <th>Event ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">No audit events</td></tr>'}
        </tbody>
      </table>
      ${loadMoreHtml}
    </div>

    <script>
      function toggleAccordion(idx) {
        const row = document.getElementById('row-' + idx);
        const detail = document.getElementById('detail-' + idx);
        const isOpen = detail.classList.contains('open');
        if (isOpen) {
          detail.classList.remove('open');
          row.classList.remove('expanded');
        } else {
          detail.classList.add('open');
          row.classList.add('expanded');
        }
      }
    </script>
  `;

  return renderPage('Audit Log', content, '/gui/audit');
}
