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
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sidebar-logo svg {
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      animation: float 4s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    .sidebar-logo-text h1 {
      font-size: 16px;
      font-weight: 700;
      color: var(--green-bright);
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .sidebar-logo-text span {
      font-size: 10px;
      color: var(--text-muted);
      display: block;
      margin-top: 1px;
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
      font-size: 10px;
      color: var(--text-muted);
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

    @media (max-width: 768px) {
      .sidebar { width: 60px; }
      .sidebar-logo { justify-content: center; padding: 0 0 24px; }
      .sidebar-logo svg { width: 32px; height: 32px; }
      .sidebar-logo-text { display: none; }
      .nav-label { display: none; }
      .nav-item { justify-content: center; padding: 10px; }
      .main { margin-left: 60px; padding: 20px; }
    }
  </style>
</head>
<body>
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
        <span>Authorization GUI</span>
      </div>
    </div>
    ${navHtml}
  </nav>
  <main class="main">
    ${content}
  </main>
</body>
</html>`;
}
