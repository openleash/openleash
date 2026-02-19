const NAV_ITEMS = [
  { path: '/gui/dashboard', label: 'Dashboard', icon: '&#9632;' },
  { path: '/gui/owners', label: 'Owners', icon: '&#9679;' },
  { path: '/gui/agents', label: 'Agents', icon: '&#9670;' },
  { path: '/gui/policies', label: 'Policies', icon: '&#9638;' },
  { path: '/gui/config', label: 'Config', icon: '&#9881;' },
  { path: '/gui/audit', label: 'Audit Log', icon: '&#9776;' },
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeHtml };

export function renderPage(title: string, content: string, activePath: string): string {
  const navHtml = NAV_ITEMS.map((item) => {
    const active = activePath === item.path || (item.path !== '/gui/dashboard' && activePath.startsWith(item.path));
    return `<a href="${item.path}" class="nav-item${active ? ' active' : ''}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - OpenLeash</title>
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
      width: 220px;
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
    }

    .sidebar-logo {
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 16px;
    }

    .sidebar-logo h1 {
      font-size: 18px;
      font-weight: 700;
      color: var(--green-bright);
      letter-spacing: -0.02em;
    }

    .sidebar-logo span {
      font-size: 11px;
      color: var(--text-muted);
      display: block;
      margin-top: 2px;
    }

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

    .nav-icon { font-size: 14px; width: 18px; text-align: center; }

    /* Main content */
    .main {
      margin-left: 220px;
      flex: 1;
      padding: 32px 40px;
      min-height: 100vh;
      background: var(--bg-elevated);
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
      transition: border-color 0.25s var(--ease-out), transform 0.25s var(--ease-out);
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
      transition: border-color 0.25s var(--ease-out), transform 0.25s var(--ease-out);
    }

    .summary-card:hover {
      border-color: var(--border-accent);
      transform: translateY(-2px);
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
      transform: translateY(-1px);
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

    @media (max-width: 768px) {
      .sidebar { width: 60px; }
      .sidebar-logo h1 { font-size: 0; }
      .sidebar-logo h1::first-letter { font-size: 18px; }
      .sidebar-logo span { display: none; }
      .nav-label { display: none; }
      .nav-item { justify-content: center; padding: 10px; }
      .main { margin-left: 60px; padding: 20px; }
    }
  </style>
</head>
<body>
  <nav class="sidebar">
    <div class="sidebar-logo">
      <h1>OpenLeash</h1>
      <span>Authorization GUI</span>
    </div>
    ${navHtml}
  </nav>
  <main class="main">
    ${content}
  </main>
</body>
</html>`;
}
