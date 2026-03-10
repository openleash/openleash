const NAV_ITEMS = [
  { path: '/gui/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/gui/owners', label: 'Owners', icon: 'group' },
  { path: '/gui/agents', label: 'Agents', icon: 'smart_toy' },
  { path: '/gui/policies', label: 'Policies', icon: 'policy' },
  { path: '/gui/config', label: 'Config', icon: 'settings' },
  { path: '/gui/mcp-glove', label: 'MCP Glove', icon: 'handshake' },
  { path: '/gui/audit', label: 'Audit Log', icon: 'receipt_long' },
  { path: '/gui/api-reference', label: 'API Docs', icon: 'api' },
];

const OWNER_NAV_ITEMS = [
  { path: '/gui/owner/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/gui/owner/profile', label: 'Profile', icon: 'account_circle' },
  { path: '/gui/owner/agents', label: 'My Agents', icon: 'smart_toy' },
  { path: '/gui/owner/policies', label: 'My Policies', icon: 'policy' },
  { path: '/gui/owner/approvals', label: 'Approvals', icon: 'task_alt' },
  { path: '/gui/owner/policy-drafts', label: 'Policy Drafts', icon: 'edit_note' },
  { path: '/gui/owner/audit', label: 'Audit Log', icon: 'receipt_long' },
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeHtml };

export function copyableId(fullId: string, truncateLength = 8): string {
  const escaped = escapeHtml(fullId);
  const display = truncateLength >= fullId.length
    ? escaped
    : escapeHtml(fullId.slice(0, truncateLength)) + '...';
  return `<span class="mono copyable" title="Click to copy" onclick="event.stopPropagation();copyId(this,'${escaped}')">${display}</span>`;
}

export function formatTimestamp(iso: string, dateOnly = false): string {
  const escaped = escapeHtml(iso);
  const fallback = dateOnly ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
  return `<span class="local-time" data-utc="${escaped}"${dateOnly ? ' data-date-only="1"' : ''} title="UTC: ${escapeHtml(fallback)}" style="white-space:nowrap">${escapeHtml(fallback)}</span>`;
}

export function formatNameWithId(name: string | undefined, uuid: string): string {
  const escaped = escapeHtml(uuid);
  if (name) {
    return `${escapeHtml(name)} <span class="mono muted copyable" title="Click to copy" onclick="event.stopPropagation();copyId(this,'${escaped}')" style="color:var(--text-muted);font-size:11px">(${escapeHtml(uuid.slice(0, 8))}...)</span>`;
  }
  return `<span class="mono truncate copyable" title="Click to copy" onclick="event.stopPropagation();copyId(this,'${escaped}')">${escapeHtml(uuid.slice(0, 8))}...</span>`;
}

export function renderPage(title: string, content: string, activePath: string, context?: 'admin' | 'owner'): string {
  const isOwner = context === 'owner';
  const navItems = isOwner ? OWNER_NAV_ITEMS : NAV_ITEMS;
  const subtitle = isOwner ? 'Owner Portal' : 'Authorization GUI';
  const dashboardPath = isOwner ? '/gui/owner/dashboard' : '/gui/dashboard';

  const navHtml = navItems.map((item) => {
    const active = activePath === item.path || (item.path !== dashboardPath && activePath.startsWith(item.path));
    return `<a href="${item.path}" class="nav-item${active ? ' active' : ''}">
      <span class="nav-icon material-symbols-outlined">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </a>`;
  }).join('\n');

  const logoutHtml = isOwner ? `
    <a href="#" class="nav-item" style="color:var(--red-bright)" onclick="
      fetch('/v1/owner/logout', {method:'POST',headers:{'Authorization':'Bearer '+sessionStorage.getItem('openleash_session')}});
      sessionStorage.removeItem('openleash_session');
      document.cookie='openleash_session=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.href='/gui/owner/login';
      return false;
    ">
      <span class="nav-icon material-symbols-outlined">logout</span>
      <span class="nav-label">Logout</span>
    </a>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - OpenLeash</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 120 120' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2334d399'/%3E%3Cstop offset='100%25' stop-color='%23065f46'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M60 10C32 10 18 30 18 48C18 66 32 80 46 84L46 88L54 88L54 84C54 84 60 86 66 84L66 88L74 88L74 84C88 80 102 66 102 48C102 30 88 10 60 10Z' fill='url(%23g)'/%3E%3Cpath d='M22 38C8 34 2 43 6 52C10 61 20 57 24 48C27 42 24 38 22 38Z' fill='url(%23g)'/%3E%3Cpath d='M98 38C112 34 118 43 114 52C110 61 100 57 96 48C93 42 96 38 98 38Z' fill='url(%23g)'/%3E%3Ccircle cx='45' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='75' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='46' cy='29' r='2' fill='%23fbbf24'/%3E%3Ccircle cx='76' cy='29' r='2' fill='%23fbbf24'/%3E%3Cpath d='M28 56C42 64 78 64 92 56' stroke='%23fbbf24' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3Cpath d='M60 62L60 98Q58 106 50 108' stroke='%23fbbf24' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3Cellipse cx='45' cy='109' rx='8' ry='4.5' fill='none' stroke='%23fbbf24' stroke-width='3'/%3E%3C/svg%3E">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --font-body: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
      --bg-deep: #050a0e;
      --bg-surface: #0a1118;
      --bg-elevated: #111d28;
      --green-bright: #34d399;
      --green-mid: #10b981;
      --green-dark: #065f46;
      --amber-bright: #fbbf24;
      --amber-mid: #f59e0b;
      --red-bright: #f87171;
      --red-mid: #ef4444;
      --text-primary: #e8f0f8;
      --text-secondary: #8899aa;
      --text-muted: #556677;
      --border-subtle: rgba(136, 153, 170, 0.15);
      --border-accent: rgba(52, 211, 153, 0.3);
      --surface-card: rgba(10, 17, 24, 0.65);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
      --sidebar-width: 220px;
      --sidebar-collapsed-width: 60px;
      --sidebar-transition: 0.3s var(--ease-out);
    }

    body.theme-light {
      --bg-deep: #f5f7fa;
      --bg-surface: #ffffff;
      --bg-elevated: #f0f2f5;
      --green-bright: #047e58;
      --green-mid: #059669;
      --green-dark: #d1fae5;
      --amber-bright: #a75b04;
      --amber-mid: #b96d08;
      --red-bright: #d72222;
      --red-mid: #dc2626;
      --text-primary: #1a1a2e;
      --text-secondary: #4a5568;
      --text-muted: #5c708c;
      --border-subtle: rgba(0, 0, 0, 0.1);
      --border-accent: rgba(4, 126, 88, 0.3);
      --surface-card: rgba(255, 255, 255, 0.8);
    }

    html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

    body {
      font-family: var(--font-body);
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-deep);
      min-height: 100vh;
      display: flex;
    }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-width);
      min-height: 100vh;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle);
      padding: 24px 0;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      transition: width var(--sidebar-transition);
      overflow: hidden;
    }

    .sidebar-logo {
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sidebar-logo svg {
      width: 38px;
      height: 38px;
      flex-shrink: 0;
    }

    .sidebar-logo-text h1 {
      font-size: 16px;
      font-weight: 700;
      color: var(--green-bright);
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .sidebar-logo-text {
      white-space: nowrap;
      overflow: hidden;
      transition: opacity 0.2s var(--ease-out), width 0.2s var(--ease-out);
    }

    .sidebar-logo-text span {
      font-size: 10px;
      color: var(--text-muted);
      display: block;
      margin-top: 1px;
    }

    .sidebar-switchers {
      margin: 0 0 32px;
      background: var(--bg-deep);
    }
    .context-switcher {
      display: flex;
    }
    .context-tab {
      flex: 1;
      padding: 7px 0;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-body);
      text-align: center;
      text-decoration: none;
      color: var(--text-muted);
      transition: all 0.25s var(--ease-out);
      letter-spacing: 0.03em;
    }
    .context-tab:hover { color: var(--text-secondary); background: rgba(136,153,170,0.05); }
    .context-tab.active { background: var(--green-dark); color: var(--green-bright); cursor: default; }
    .context-tab-icon { display: none; }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.25s var(--ease-out);
      border-left: 3px solid transparent;
    }

    .nav-item:hover {
      color: var(--text-primary);
      background: rgba(52, 211, 153, 0.05);
    }

    .nav-item.active {
      color: var(--green-bright);
      background: rgba(52, 211, 153, 0.08);
      border-left-color: var(--green-bright);
    }

    .nav-icon { font-size: 18px; width: 20px; text-align: center; flex-shrink: 0; }

    .nav-label {
      white-space: nowrap;
      overflow: hidden;
      transition: opacity 0.2s var(--ease-out);
    }

    /* Main content */
    .main {
      margin-left: var(--sidebar-width);
      flex: 1;
      padding: 32px 40px;
      min-height: 100vh;
      background: var(--bg-elevated);
      transition: margin-left var(--sidebar-transition);
    }

    .page-header {
      margin-bottom: 28px;
    }

    .page-header h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .page-header p {
      color: var(--text-secondary);
      font-size: 13px;
      margin-top: 4px;
    }

    /* Cards */
    .card {
      background: var(--surface-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 20px;
      margin-bottom: 20px;
      transition: border-color 0.25s var(--ease-out);
    }

    .card:hover {
      border-color: var(--border-accent);
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }

    /* Summary cards grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }

    .summary-card {
      background: var(--surface-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 20px;
      transition: border-color 0.25s var(--ease-out);
    }

    .summary-card:hover {
      border-color: var(--border-accent);
    }

    .summary-card .label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .summary-card .value {
      font-size: 28px;
      font-weight: 700;
      color: var(--green-bright);
      margin-top: 4px;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead th {
      text-align: left;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border-subtle);
    }

    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(136, 153, 170, 0.08);
      color: var(--text-secondary);
    }

    tbody tr:hover td {
      color: var(--text-primary);
      background: rgba(52, 211, 153, 0.03);
    }

    .mono { font-family: var(--font-mono); font-size: 12px; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .badge-green { background: rgba(52, 211, 153, 0.15); color: var(--green-bright); }
    .badge-amber { background: rgba(251, 191, 36, 0.15); color: var(--amber-bright); }
    .badge-red { background: rgba(248, 113, 113, 0.15); color: var(--red-bright); }
    .badge-muted { background: rgba(136, 153, 170, 0.1); color: var(--text-muted); }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: all 0.25s var(--ease-out);
      border: 1px solid transparent;
      text-decoration: none;
    }

    .btn-primary {
      background: var(--green-dark);
      color: var(--green-bright);
      border-color: var(--border-accent);
    }

    .btn-primary:hover {
      background: rgba(16, 185, 129, 0.2);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text-secondary);
      border-color: var(--border-subtle);
    }

    .btn-secondary:hover {
      color: var(--text-primary);
      border-color: var(--text-muted);
    }

    /* Links in tables */
    a.table-link {
      color: var(--green-bright);
      text-decoration: none;
    }

    a.table-link:hover {
      color: var(--amber-bright);
    }

    /* YAML editor */
    .yaml-editor {
      width: 100%;
      min-height: 400px;
      background: var(--bg-deep);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      resize: vertical;
      outline: none;
      transition: border-color 0.25s var(--ease-out);
    }

    .yaml-editor:focus {
      border-color: var(--green-mid);
    }

    /* Alert */
    .alert {
      padding: 12px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .alert-error {
      background: rgba(248, 113, 113, 0.1);
      border: 1px solid rgba(248, 113, 113, 0.3);
      color: var(--red-bright);
    }

    .alert-success {
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.3);
      color: var(--green-bright);
    }

    .hidden { display: none; }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(5, 10, 14, 0.8);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    .modal-overlay.open {
      display: flex;
    }

    .modal {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 28px 32px;
      max-width: 480px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    }

    .modal-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--text-primary);
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }

    .modal-error {
      font-size: 13px;
      color: var(--red-bright);
      margin-top: 8px;
      min-height: 20px;
    }

    /* Forms */
    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .form-input, .form-select {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg-deep);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      font-family: var(--font-body);
      font-size: 13px;
      outline: none;
      transition: border-color 0.25s var(--ease-out);
    }

    .form-input:focus, .form-select:focus {
      border-color: var(--green-mid);
    }

    .form-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238899aa' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
    }
    body.theme-light .form-select {
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%234a5568' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    }

    .form-help {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Key display */
    .key-display {
      background: var(--bg-deep);
      border: 1px solid var(--border-accent);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--green-bright);
      word-break: break-all;
      line-height: 1.5;
      user-select: all;
    }

    /* Accordion */
    .accordion-row {
      cursor: pointer;
    }

    .accordion-row:hover td {
      color: var(--text-primary);
      background: rgba(52, 211, 153, 0.03);
    }

    .accordion-detail {
      display: none;
    }

    .accordion-detail.open {
      display: table-row;
    }

    .accordion-detail td {
      padding: 0 12px 16px;
      border-bottom: 1px solid rgba(136, 153, 170, 0.08);
    }

    .accordion-content {
      background: var(--bg-deep);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chevron {
      display: inline-block;
      transition: transform 0.2s var(--ease-out);
      font-size: 16px;
      color: var(--text-muted);
      vertical-align: middle;
    }

    .accordion-row.expanded .chevron {
      transform: rotate(90deg);
    }

    /* Config display */
    .config-block {
      background: var(--bg-deep);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    /* Truncate */
    .truncate {
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Copyable IDs */
    .copyable { cursor: pointer; position: relative; }
    .copyable:hover { color: var(--green-bright) !important; }
    .copy-tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--green-dark);
      color: var(--green-bright);
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-body);
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s var(--ease-out);
      z-index: 100;
    }
    .copy-tooltip.show { opacity: 1; }

    /* Policy Builder Tree */
    .tree-node {
      border-bottom: 1px solid rgba(136, 153, 170, 0.06);
    }

    .tree-node-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      transition: background 0.15s var(--ease-out);
    }

    .tree-node-row:hover {
      background: rgba(52, 211, 153, 0.03);
    }

    .tree-toggle {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 10px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s var(--ease-out);
      flex-shrink: 0;
    }

    .tree-toggle:hover { color: var(--text-primary); }
    .tree-toggle.expanded { transform: rotate(90deg); }

    .tree-toggle-spacer { width: 18px; flex-shrink: 0; }

    .tree-node-label {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tree-node-path {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
    }

    .tree-node-inherited {
      font-size: 11px;
      color: var(--text-muted);
      font-style: italic;
      white-space: nowrap;
    }

    .inherited-deny { color: rgba(248, 113, 113, 0.6); }
    .inherited-allow { color: rgba(52, 211, 153, 0.6); }

    .tree-node-controls {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .tree-btn {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      font-family: var(--font-body);
      letter-spacing: 0.04em;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s var(--ease-out);
      background: transparent;
      color: var(--text-muted);
    }

    .tree-btn:hover { color: var(--text-primary); }

    .tree-btn-deny { border-color: rgba(248, 113, 113, 0.2); }
    .tree-btn-deny:hover { background: rgba(248, 113, 113, 0.1); color: var(--red-bright); }
    .tree-btn-deny.active { background: rgba(248, 113, 113, 0.15); color: var(--red-bright); border-color: rgba(248, 113, 113, 0.4); }

    .tree-btn-allow { border-color: rgba(52, 211, 153, 0.2); }
    .tree-btn-allow:hover { background: rgba(52, 211, 153, 0.1); color: var(--green-bright); }
    .tree-btn-allow.active { background: rgba(52, 211, 153, 0.15); color: var(--green-bright); border-color: rgba(52, 211, 153, 0.4); }

    .tree-btn-custom { border-color: rgba(251, 191, 36, 0.2); }
    .tree-btn-custom:hover { background: rgba(251, 191, 36, 0.1); color: var(--amber-bright); }
    .tree-btn-custom.active { background: rgba(251, 191, 36, 0.15); color: var(--amber-bright); border-color: rgba(251, 191, 36, 0.4); }

    .tree-btn-clear {
      border-color: rgba(136, 153, 170, 0.15);
      font-size: 12px;
      padding: 2px 6px;
    }
    .tree-btn-clear:hover { background: rgba(136, 153, 170, 0.1); }

    .tree-children { padding-left: 0; }

    .tree-node-constraints { padding: 8px 12px 12px 50px; }

    .constraint-panel {
      background: var(--bg-deep);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }

    .constraint-row label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .constraint-row .form-input,
    .constraint-row .form-select {
      font-size: 12px;
      padding: 5px 8px;
    }

    /* Mode Toggle */
    .mode-toggle {
      display: inline-flex;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .mode-btn {
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-body);
      background: transparent;
      color: var(--text-muted);
      border: none;
      cursor: pointer;
      transition: all 0.2s var(--ease-out);
    }

    .mode-btn:hover { color: var(--text-primary); background: rgba(52, 211, 153, 0.05); }
    .mode-btn.active { background: var(--green-dark); color: var(--green-bright); }

    /* Theme switcher */
    .theme-switcher {
      display: flex;
    }
    .theme-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 0;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.25s var(--ease-out);
      font-family: var(--font-body);
    }
    .theme-btn:hover { color: var(--text-secondary); background: rgba(136,153,170,0.05); }
    .theme-btn.active { background: var(--green-dark); color: var(--green-bright); cursor: default; }
    .theme-btn .material-symbols-outlined { font-size: 16px; }

    /* Sidebar toggle button */
    .sidebar-toggle {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      width: 100%;
      padding: 12px 20px;
      background: none;
      border: none;
      border-top: 1px solid var(--border-subtle);
      color: var(--text-muted);
      cursor: pointer;
      transition: color 0.2s var(--ease-out), background 0.2s var(--ease-out);
    }
    .sidebar-toggle:hover {
      color: var(--text-primary);
      background: rgba(52, 211, 153, 0.05);
    }
    .sidebar-toggle .material-symbols-outlined {
      font-size: 18px;
      width: 20px;
      text-align: center;
    }
    .sidebar-toggle .expand-icon { display: none; }

    /* Sidebar bottom area */
    .sidebar-bottom {
      margin-top: auto;
    }

    /* Collapsed sidebar */
    body.sidebar-collapsed .sidebar { width: var(--sidebar-collapsed-width); }
    body.sidebar-collapsed .main { margin-left: var(--sidebar-collapsed-width); }
    body.sidebar-collapsed .sidebar-logo { justify-content: center; padding: 0 0 24px; gap: 0; }
    body.sidebar-collapsed .sidebar-logo svg { width: 32px; height: 32px; }
    body.sidebar-collapsed .sidebar-logo-text { opacity: 0; width: 0; }
    body.sidebar-collapsed .nav-label { opacity: 0; width: 0; }
    body.sidebar-collapsed .nav-item { justify-content: center; padding: 10px; border-left-width: 0; gap: 0; }
    body.sidebar-collapsed .nav-item.active { border-left-width: 0; }
    body.sidebar-collapsed .sidebar-switchers { display: none; }
    body.sidebar-collapsed .sidebar-toggle { justify-content: center; padding: 10px; }
    body.sidebar-collapsed .sidebar-toggle .collapse-icon { display: none; }
    body.sidebar-collapsed .sidebar-toggle .expand-icon { display: inline; }

    @media (max-width: 768px) {
      .sidebar { width: var(--sidebar-collapsed-width); }
      .sidebar-logo { justify-content: center; padding: 0 0 24px; }
      .sidebar-logo svg { width: 32px; height: 32px; }
      .sidebar-logo-text { opacity: 0; width: 0; }
      .nav-label { opacity: 0; width: 0; }
      .nav-item { justify-content: center; padding: 10px; }
      .main { margin-left: var(--sidebar-collapsed-width); padding: 20px; }
      .sidebar-switchers { display: none; }
      .sidebar-toggle { display: none; }
    }
  </style>
</head>
<body>
  <script>
    if(localStorage.getItem('ol_sidebar_collapsed')==='1')document.body.classList.add('sidebar-collapsed');
    (function(){var t=localStorage.getItem('ol_theme')||'system';if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.body.classList.add('theme-light');})();
  </script>
  <nav class="sidebar">
    <div class="sidebar-logo">
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="OpenLeash logo">
        <defs>
          <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#34d399"/>
            <stop offset="100%" stop-color="#065f46"/>
          </linearGradient>
        </defs>
        <path d="M60 10 C32 10 18 30 18 48 C18 66 32 80 46 84 L46 88 L54 88 L54 84 C54 84 60 86 66 84 L66 88 L74 88 L74 84 C88 80 102 66 102 48 C102 30 88 10 60 10Z" fill="url(#lg)"/>
        <path d="M22 38 C8 34 2 43 6 52 C10 61 20 57 24 48 C27 42 24 38 22 38Z" fill="url(#lg)"/>
        <path d="M98 38 C112 34 118 43 114 52 C110 61 100 57 96 48 C93 42 96 38 98 38Z" fill="url(#lg)"/>
        <path d="M46 15 Q36 5 31 8" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M74 15 Q84 5 89 8" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="45" cy="30" r="5.5" fill="#050a0e"/>
        <circle cx="75" cy="30" r="5.5" fill="#050a0e"/>
        <circle cx="46" cy="29" r="2" fill="#fbbf24"/>
        <circle cx="76" cy="29" r="2" fill="#fbbf24"/>
        <path d="M28 56 C42 64 78 64 92 56" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M60 62 L60 98 Q58 106 50 108" stroke="#fbbf24" stroke-width="3" stroke-linecap="round" fill="none"/>
        <ellipse cx="45" cy="109" rx="8" ry="4.5" fill="none" stroke="#fbbf24" stroke-width="3"/>
      </svg>
      <div class="sidebar-logo-text">
        <h1>OpenLeash</h1>
        <span>${subtitle}</span>
      </div>
    </div>
    <div class="sidebar-switchers">
      <div class="context-switcher">
        <a href="/gui/dashboard" class="context-tab${!isOwner ? ' active' : ''}">
          <span class="context-tab-icon material-symbols-outlined">admin_panel_settings</span>
          <span class="context-tab-label">Admin</span>
        </a>
        <a href="/gui/owner/dashboard" class="context-tab${isOwner ? ' active' : ''}">
          <span class="context-tab-icon material-symbols-outlined">person</span>
          <span class="context-tab-label">Owner</span>
        </a>
      </div>
      <div class="theme-switcher">
        <button class="theme-btn" data-theme="system" onclick="setTheme('system')" title="System theme"><span class="material-symbols-outlined">desktop_windows</span></button>
        <button class="theme-btn" data-theme="light" onclick="setTheme('light')" title="Light theme"><span class="material-symbols-outlined">light_mode</span></button>
        <button class="theme-btn" data-theme="dark" onclick="setTheme('dark')" title="Dark theme"><span class="material-symbols-outlined">dark_mode</span></button>
      </div>
    </div>
    ${navHtml}
    <div class="sidebar-bottom">
      ${logoutHtml}
      <button class="sidebar-toggle" onclick="toggleSidebar()" title="Toggle sidebar">
        <span class="material-symbols-outlined collapse-icon">left_panel_close</span>
        <span class="material-symbols-outlined expand-icon">left_panel_open</span>
      </button>
    </div>
  </nav>
  <main class="main">
    ${content}
  </main>
  <div id="ol-dialog" class="modal-overlay" onclick="if(event.target===this)olDialogCancel()">
    <div class="modal" style="max-width:420px">
      <div class="modal-title" id="ol-dialog-title"></div>
      <p id="ol-dialog-msg" style="font-size:13px;color:var(--text-secondary);margin-bottom:16px"></p>
      <div id="ol-dialog-input-wrap" style="display:none;margin-bottom:16px">
        <input type="text" id="ol-dialog-input" class="form-input" style="width:100%">
      </div>
      <div class="modal-footer">
        <button id="ol-dialog-cancel" class="btn btn-secondary" onclick="olDialogCancel()">Cancel</button>
        <button id="ol-dialog-ok" class="btn btn-primary" onclick="olDialogOk()">OK</button>
      </div>
    </div>
  </div>
  <script>
    function toggleSidebar(){document.body.classList.toggle('sidebar-collapsed');localStorage.setItem('ol_sidebar_collapsed',document.body.classList.contains('sidebar-collapsed')?'1':'0');}
    function setTheme(t){localStorage.setItem('ol_theme',t);applyTheme(t);document.querySelectorAll('.theme-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-theme')===t);});}
    function applyTheme(t){var isLight=t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);document.body.classList.toggle('theme-light',isLight);}
    (function(){var t=localStorage.getItem('ol_theme')||'system';document.querySelectorAll('.theme-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-theme')===t);});window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',function(){var cur=localStorage.getItem('ol_theme')||'system';if(cur==='system')applyTheme('system');});})();
    (function(){function pad(n){return n<10?'0'+n:n;}function isoLocal(d,dateOnly){var y=d.getFullYear(),m=pad(d.getMonth()+1),day=pad(d.getDate());if(dateOnly)return y+'-'+m+'-'+day;return y+'-'+m+'-'+day+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());}try{var cells=document.querySelectorAll('.local-time[data-utc]');for(var i=0;i<cells.length;i++){var utc=cells[i].getAttribute('data-utc');var d=new Date(utc);if(!isNaN(d.getTime())){var dateOnly=cells[i].getAttribute('data-date-only')==='1';cells[i].textContent=isoLocal(d,dateOnly);cells[i].title='UTC: '+utc.slice(0,19).replace('T',' ');}}}catch(_){}})();
    function copyId(el,id){navigator.clipboard.writeText(id);var t=el.querySelector('.copy-tooltip');if(!t){t=document.createElement('span');t.className='copy-tooltip';t.textContent='Copied!';el.appendChild(t);}t.classList.add('show');clearTimeout(el._copyTimer);el._copyTimer=setTimeout(function(){t.classList.remove('show');},1200);}
    var _olResolve=null;
    function olDialogCancel(){document.getElementById('ol-dialog').classList.remove('open');if(_olResolve){_olResolve(null);_olResolve=null;}}
    function olDialogOk(){var d=document.getElementById('ol-dialog');var inp=document.getElementById('ol-dialog-input-wrap');d.classList.remove('open');if(_olResolve){_olResolve(inp.style.display!=='none'?document.getElementById('ol-dialog-input').value:true);_olResolve=null;}}
    function olAlert(msg,title){return new Promise(function(r){_olResolve=function(){r(undefined);};document.getElementById('ol-dialog-title').textContent=title||'Notice';document.getElementById('ol-dialog-msg').textContent=msg;document.getElementById('ol-dialog-input-wrap').style.display='none';document.getElementById('ol-dialog-cancel').style.display='none';document.getElementById('ol-dialog-ok').textContent='OK';document.getElementById('ol-dialog').classList.add('open');});}
    function olConfirm(msg,title){return new Promise(function(r){_olResolve=r;document.getElementById('ol-dialog-title').textContent=title||'Confirm';document.getElementById('ol-dialog-msg').textContent=msg;document.getElementById('ol-dialog-input-wrap').style.display='none';document.getElementById('ol-dialog-cancel').style.display='';document.getElementById('ol-dialog-ok').textContent='Confirm';document.getElementById('ol-dialog').classList.add('open');});}
    function olPrompt(msg,placeholder,title){return new Promise(function(r){_olResolve=r;document.getElementById('ol-dialog-title').textContent=title||'Input';document.getElementById('ol-dialog-msg').textContent=msg;var inp=document.getElementById('ol-dialog-input');inp.value='';inp.placeholder=placeholder||'';document.getElementById('ol-dialog-input-wrap').style.display='block';document.getElementById('ol-dialog-cancel').style.display='';document.getElementById('ol-dialog-ok').textContent='OK';document.getElementById('ol-dialog').classList.add('open');inp.focus();});}
  </script>
</body>
</html>`;
}
