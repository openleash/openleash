import { renderPage, escapeHtml, formatNameWithId, copyableId, formatTimestamp, infoIcon, INFO_AUDIT_EVENTS } from '../layout.js';

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

export interface AuditNameMap {
  owners: Map<string, string>;
  agents: Map<string, string>;
  eventTypes?: string[];
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

function resolveId(uuid: string, nameMap: AuditNameMap): string | undefined {
  return nameMap.owners.get(uuid) ?? nameMap.agents.get(uuid);
}

function principalDisplay(principalId: string | null, nameMap?: AuditNameMap): string {
  if (!principalId) return '<span style="color:var(--text-muted)">--</span>';
  if (!nameMap) return copyableId(principalId);
  const name = resolveId(principalId, nameMap);
  return formatNameWithId(name, principalId);
}

function resultBadge(result: string): string {
  const escaped = escapeHtml(result);
  if (result === 'ALLOW') return `<span class="badge badge-green">${escaped}</span>`;
  if (result === 'DENY') return `<span class="badge badge-red">${escaped}</span>`;
  if (result.startsWith('REQUIRE_')) return `<span class="badge badge-amber">${escaped}</span>`;
  return `<span class="badge badge-muted">${escaped}</span>`;
}

function validBadge(valid: boolean): string {
  return valid
    ? '<span class="badge badge-green">VALID</span>'
    : '<span class="badge badge-red">INVALID</span>';
}

function eventSummary(entry: AuditEntry, nameMap?: AuditNameMap, policyBasePath = '/gui/policies'): string {
  const meta = entry.metadata_json;
  switch (entry.event_type) {
    case 'OWNER_CREATED':
      return meta.display_name ? escapeHtml(String(meta.display_name)) : '';
    case 'AGENT_CHALLENGE_ISSUED':
    case 'AGENT_REGISTERED':
      if (meta.agent_id) return `<span class="mono">${escapeHtml(String(meta.agent_id))}</span>`;
      if (meta.agent_principal_id && nameMap) {
        const name = resolveId(String(meta.agent_principal_id), nameMap);
        return name ? escapeHtml(name) : `<span class="mono">${escapeHtml(String(meta.agent_principal_id).slice(0, 8))}...</span>`;
      }
      return '';
    case 'POLICY_UPSERTED':
    case 'POLICY_UPDATED':
    case 'POLICY_DELETED':
    case 'POLICY_UNBOUND':
      if (meta.policy_id) {
        const pid = String(meta.policy_id);
        if (policyBasePath === '/gui/owner/policies') {
          return `<span class="mono">${escapeHtml(pid.slice(0, 8))}...</span>`;
        }
        return `<a href="${policyBasePath}/${escapeHtml(pid)}" class="table-link mono">${escapeHtml(pid.slice(0, 8))}...</a>`;
      }
      return '';
    case 'AUTHORIZE_CALLED':
      return meta.action_type ? `<span class="mono">${escapeHtml(String(meta.action_type))}</span>` : '';
    case 'DECISION_CREATED':
      return meta.result ? resultBadge(String(meta.result)) : '';
    case 'PROOF_VERIFIED':
      if (typeof meta.valid === 'boolean') return validBadge(meta.valid);
      return '';
    case 'PLAYGROUND_RUN':
      return meta.scenario ? escapeHtml(String(meta.scenario)) : '';
    case 'KEY_ROTATED':
      if (meta.new_kid) return `<span class="mono">${escapeHtml(String(meta.new_kid).slice(0, 12))}...</span>`;
      return '';
    case 'SERVER_STARTED':
      return meta.bind_address ? escapeHtml(String(meta.bind_address)) : '';
    default:
      return '';
  }
}

function formatMetadata(meta: Record<string, unknown>, nameMap?: AuditNameMap, policyBasePath = '/gui/policies'): string {
  const entries = Object.entries(meta);
  if (entries.length === 0) return '<span style="color:var(--text-muted)">No metadata</span>';

  return entries.map(([key, val]) => {
    const keyHtml = `<span style="color:var(--green-bright)">${escapeHtml(key)}</span>`;

    // Resolve owner/agent principal IDs to names
    if ((key === 'owner_principal_id' || key === 'agent_principal_id') && typeof val === 'string' && nameMap) {
      const name = resolveId(val, nameMap);
      const display = formatNameWithId(name, val);
      return `<div style="margin-bottom:6px">${keyHtml}: <span style="color:var(--text-primary)">${display}</span></div>`;
    }

    // Link policy_id to editor (admin only — owner has no detail view)
    if (key === 'policy_id' && typeof val === 'string') {
      if (policyBasePath === '/gui/owner/policies') {
        return `<div style="margin-bottom:6px">${keyHtml}: <span class="mono">${escapeHtml(val)}</span></div>`;
      }
      return `<div style="margin-bottom:6px">${keyHtml}: <a href="${policyBasePath}/${escapeHtml(val)}" class="table-link mono">${escapeHtml(val)}</a></div>`;
    }

    // Badge for result
    if (key === 'result' && typeof val === 'string') {
      return `<div style="margin-bottom:6px">${keyHtml}: ${resultBadge(val)}</div>`;
    }

    // Badge for valid
    if (key === 'valid' && typeof val === 'boolean') {
      return `<div style="margin-bottom:6px">${keyHtml}: ${validBadge(val)}</div>`;
    }

    const valStr = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
    return `<div style="margin-bottom:6px">${keyHtml}: <span style="color:var(--text-primary)">${escapeHtml(valStr)}</span></div>`;
  }).join('');
}

export function renderAudit(data: AuditData, cursor: number, nameMap?: AuditNameMap, context?: 'admin' | 'owner'): string {
  const isOwner = context === 'owner';
  const policyBasePath = isOwner ? '/gui/owner/policies' : '/gui/policies';
  const auditBasePath = isOwner ? '/gui/owner/audit' : '/gui/audit';
  // Reverse to show newest first
  const items = [...data.items].reverse();

  const rows = items.map((e, i) => {
    const idx = cursor + data.items.length - 1 - i;
    const hasExtra = e.principal_id || e.action_id || e.decision_id || Object.keys(e.metadata_json).length > 0;

    const extraFields: string[] = [];
    if (e.principal_id) {
      const resolvedName = nameMap?.owners.get(e.principal_id) ?? nameMap?.agents.get(e.principal_id);
      const pDisplay = resolvedName
        ? `${escapeHtml(resolvedName)} <span class="mono" style="color:var(--text-muted);font-size:11px">(${escapeHtml(e.principal_id)})</span>`
        : escapeHtml(e.principal_id);
      extraFields.push(`<div style="margin-bottom:6px"><span style="color:var(--green-bright)">principal_id</span>: <span style="color:var(--text-primary)">${pDisplay}</span></div>`);
    }
    if (e.action_id) extraFields.push(`<div style="margin-bottom:6px"><span style="color:var(--green-bright)">action_id</span>: <span style="color:var(--text-primary)">${escapeHtml(e.action_id)}</span></div>`);
    if (e.decision_id) extraFields.push(`<div style="margin-bottom:6px"><span style="color:var(--green-bright)">decision_id</span>: <span style="color:var(--text-primary)">${escapeHtml(e.decision_id)}</span></div>`);

    const summary = eventSummary(e, nameMap, policyBasePath);

    return `
      <tr class="accordion-row" onclick="toggleAccordion(${idx})" id="row-${idx}" data-event-type="${escapeHtml(e.event_type)}">
        <td style="width:20px"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${formatTimestamp(e.timestamp)}</td>
        <td>${eventBadge(e.event_type)}</td>
        <td>${principalDisplay(e.principal_id, nameMap)}</td>
        <td>${summary || '<span style="color:var(--text-muted)">--</span>'}</td>
        <td>${copyableId(e.event_id)}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${idx}" data-event-type="${escapeHtml(e.event_type)}">
        <td colspan="6">
          <div class="accordion-content">
            ${extraFields.join('')}
            ${formatMetadata(e.metadata_json, nameMap, policyBasePath)}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const nextCursor = data.next_cursor;
  const loadMoreHtml = nextCursor
    ? `<div style="text-align:center;margin-top:16px"><a href="${auditBasePath}?cursor=${escapeHtml(nextCursor)}" class="btn btn-secondary">Load More</a></div>`
    : '';

  // Build event type filter options
  const eventTypes = nameMap?.eventTypes ?? [];
  const filterOptions = eventTypes.map((t) =>
    `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
  ).join('');

  const filterHtml = eventTypes.length > 0
    ? `<div class="toolbar">
        <select id="event-filter" class="form-select" style="width:auto;min-width:220px" onchange="filterEvents()">
          <option value="">All event types</option>
          ${filterOptions}
        </select>
        <span id="filter-count" style="color:var(--text-muted);font-size:12px"></span>
      </div>`
    : '';

  const content = `
    <div class="page-header">
      <h2>Audit Log</h2>
      <p>Authorization events, newest first${cursor > 0 ? ` (from offset ${cursor})` : ''}</p>
    </div>

    ${filterHtml}

    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:20px"></th>
            <th>Timestamp</th>
            <th>Event${infoIcon('audit-events', INFO_AUDIT_EVENTS)}</th>
            <th>Principal</th>
            <th>Detail</th>
            <th>Event ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">No audit events</td></tr>'}
        </tbody>
      </table>
      ${loadMoreHtml}
    </div>

    <script>
      function toggleAccordion(idx) {
        var row = document.getElementById('row-' + idx);
        var detail = document.getElementById('detail-' + idx);
        var isOpen = detail.classList.contains('open');
        if (isOpen) {
          detail.classList.remove('open');
          row.classList.remove('expanded');
        } else {
          detail.classList.add('open');
          row.classList.add('expanded');
        }
      }

      function filterEvents() {
        var val = document.getElementById('event-filter').value;
        var rows = document.querySelectorAll('tr[data-event-type]');
        var visible = 0;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var match = !val || row.getAttribute('data-event-type') === val;
          row.style.display = match ? '' : 'none';
          // Close hidden accordion details
          if (!match && row.classList.contains('accordion-detail')) {
            row.classList.remove('open');
          }
          if (!match && row.classList.contains('accordion-row')) {
            row.classList.remove('expanded');
          }
          // Count visible main rows
          if (match && row.classList.contains('accordion-row')) {
            visible++;
          }
        }
        var counter = document.getElementById('filter-count');
        if (counter) {
          counter.textContent = val ? visible + ' event' + (visible !== 1 ? 's' : '') : '';
        }
      }
    </script>
  `;

  return renderPage('Audit Log', content, auditBasePath, context);
}
