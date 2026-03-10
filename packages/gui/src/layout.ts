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

/**
 * Render an info icon with a click-to-toggle popover.
 * @param id   Unique identifier (used as DOM id suffix)
 * @param html Rich HTML content for the popover body
 */
export function infoIcon(id: string, html: string): string {
  return `<span class="info-popover-wrap"><span class="material-symbols-outlined info-trigger" onclick="toggleInfo(event,'info-${escapeHtml(id)}')" tabindex="0" role="button" aria-label="More info">info</span><div class="info-popover" id="info-${escapeHtml(id)}">${html}</div></span>`;
}

// ─── Shared popover content ──────────────────────────────────────────

export const INFO_DECISIONS = `
  <div class="info-title">Policy Decisions</div>
  <p style="margin-bottom:8px">When an agent requests authorization, the policy engine evaluates rules and returns one of these decisions:</p>
  <dl>
    <dt><span class="badge badge-green">ALLOW</span></dt>
    <dd>The action is permitted. A cryptographic proof token is issued.</dd>
    <dt><span class="badge badge-red">DENY</span></dt>
    <dd>The action is blocked. No proof token is issued.</dd>
    <dt><span class="badge badge-amber">REQUIRE_APPROVAL</span></dt>
    <dd>The action needs explicit human approval from the owner before proceeding.</dd>
    <dt><span class="badge badge-amber">REQUIRE_STEP_UP</span></dt>
    <dd>The action requires a higher identity assurance level (e.g. verified ID) before proceeding.</dd>
    <dt><span class="badge badge-amber">REQUIRE_DEPOSIT</span></dt>
    <dd>The action requires a financial deposit or escrow before proceeding.</dd>
  </dl>`;

export const INFO_OBLIGATIONS = `
  <div class="info-title">Obligations</div>
  <p style="margin-bottom:8px">Obligations are additional requirements attached to a policy rule. They determine the decision type when a rule matches:</p>
  <dl>
    <dt><span class="badge badge-amber">HUMAN_APPROVAL</span></dt>
    <dd>An owner must manually approve or deny the request. Produces a REQUIRE_APPROVAL decision.</dd>
    <dt><span class="badge badge-amber">STEP_UP_AUTH</span></dt>
    <dd>The requester must provide stronger identity verification. Produces a REQUIRE_STEP_UP decision.</dd>
    <dt><span class="badge badge-amber">DEPOSIT</span></dt>
    <dd>A financial deposit is required. Produces a REQUIRE_DEPOSIT decision.</dd>
    <dt><span class="badge badge-muted">COUNTERPARTY_ATTESTATION</span></dt>
    <dd>A third-party attestation is requested but does not block the action. Decision remains ALLOW.</dd>
  </dl>`;

export const INFO_OWNER_STATUS = `
  <div class="info-title">Owner Status</div>
  <dl>
    <dt><span class="badge badge-green">ACTIVE</span></dt>
    <dd>Account is fully operational. Agents can request authorization and policies are evaluated.</dd>
    <dt><span class="badge badge-amber">SUSPENDED</span></dt>
    <dd>Account is temporarily disabled. Agents cannot authorize new actions, but data is preserved.</dd>
    <dt><span class="badge badge-red">REVOKED</span></dt>
    <dd>Account is permanently deactivated. All associated agents are also revoked. Cannot be undone.</dd>
  </dl>`;

export const INFO_AGENT_STATUS = `
  <div class="info-title">Agent Status</div>
  <dl>
    <dt><span class="badge badge-green">ACTIVE</span></dt>
    <dd>The agent is operational and can request authorization from the policy engine.</dd>
    <dt><span class="badge badge-red">REVOKED</span></dt>
    <dd>The agent has been permanently deactivated. It can no longer request authorization. Revocation cannot be undone.</dd>
  </dl>`;

export const INFO_VERIFICATION_LEVEL = `
  <div class="info-title">Verification Levels</div>
  <p style="margin-bottom:8px">Each government or company ID goes through verification stages:</p>
  <dl>
    <dt><span class="badge badge-muted">UNVERIFIED</span></dt>
    <dd>The ID has been added but not yet checked.</dd>
    <dt><span class="badge badge-amber">FORMAT VALID</span></dt>
    <dd>The ID value passes format validation (e.g. correct length, check digit) but has not been independently verified.</dd>
    <dt><span class="badge badge-green">VERIFIED</span></dt>
    <dd>The ID has been fully verified against an authoritative source.</dd>
  </dl>`;

export const INFO_POLICY_DRAFTS = `
  <div class="info-title">Policy Drafts</div>
  <p style="margin-bottom:8px">Agents can propose new policies when they need access to action types not yet covered by existing rules. These proposals appear here for your review.</p>
  <dl>
    <dt><span class="badge badge-amber">All agents</span></dt>
    <dd>The proposed policy would apply to all your agents, not just the one suggesting it. Review carefully.</dd>
    <dt>Self</dt>
    <dd>The agent is proposing a policy that only applies to itself.</dd>
    <dt><span class="badge badge-amber">Other agent</span></dt>
    <dd>The agent is proposing a policy for a different agent. This is unusual and warrants careful review.</dd>
  </dl>`;

export const INFO_APPROVAL_REQUESTS = `
  <div class="info-title">Approval Requests</div>
  <p style="margin-bottom:8px">When a policy evaluates to REQUIRE_APPROVAL, the agent's action is paused and an approval request is created for you to review.</p>
  <dl>
    <dt><span class="badge badge-amber">PENDING</span></dt>
    <dd>Waiting for your decision. The agent is blocked until you approve or deny.</dd>
    <dt><span class="badge badge-green">APPROVED</span></dt>
    <dd>You approved the request. The agent received a proof token and proceeded.</dd>
    <dt><span class="badge badge-red">DENIED</span></dt>
    <dd>You denied the request. The agent was not authorized to proceed.</dd>
    <dt><span class="badge badge-red">EXPIRED</span></dt>
    <dd>The request timed out before a decision was made.</dd>
  </dl>`;

export const INFO_PROOF_TOKENS = `
  <div class="info-title">Proof Tokens</div>
  <p style="margin-bottom:8px">When an action is authorized (ALLOW), OpenLeash issues a <strong style="color:var(--text-primary)">PASETO v4.public</strong> cryptographic proof token.</p>
  <dl>
    <dt>What it proves</dt>
    <dd>That a specific agent was authorized to perform a specific action at a specific time, under a specific policy.</dd>
    <dt>How verification works</dt>
    <dd>Third parties (counterparties) can verify the token offline using the server's public key, without contacting OpenLeash.</dd>
    <dt>What's inside</dt>
    <dd>The token contains the decision ID, action hash, agent and owner IDs, matched rule, and expiration time.</dd>
  </dl>`;

export const INFO_AUDIT_EVENTS = `
  <div class="info-title">Audit Event Types</div>
  <dl>
    <dt><span class="badge badge-green">SERVER_STARTED</span></dt>
    <dd>The OpenLeash server was started.</dd>
    <dt><span class="badge badge-green">OWNER_CREATED</span></dt>
    <dd>A new owner principal was created.</dd>
    <dt><span class="badge badge-green">AGENT_REGISTERED</span></dt>
    <dd>A new agent was registered under an owner.</dd>
    <dt><span class="badge badge-amber">POLICY_UPSERTED</span></dt>
    <dd>A policy was created or updated.</dd>
    <dt><span class="badge badge-muted">AUTHORIZE_CALLED</span></dt>
    <dd>An agent submitted an authorization request.</dd>
    <dt><span class="badge badge-muted">DECISION_CREATED</span></dt>
    <dd>The policy engine produced a decision (ALLOW, DENY, etc.).</dd>
    <dt><span class="badge badge-muted">PROOF_VERIFIED</span></dt>
    <dd>A proof token was verified (valid or invalid).</dd>
    <dt><span class="badge badge-amber">KEY_ROTATED</span></dt>
    <dd>The server's signing key was rotated. New tokens use the new key; old tokens remain verifiable.</dd>
  </dl>`;

export const INFO_MCP_GLOVE = `
  <div class="info-title">MCP Glove</div>
  <p style="margin-bottom:8px">MCP Glove is a transparent governance proxy that sits between an MCP client (e.g. Claude Desktop) and an upstream MCP server.</p>
  <dl>
    <dt>What it does</dt>
    <dd>Intercepts every MCP tool call, maps it to an OpenLeash action type, and enforces your authorization policies before forwarding to the upstream server.</dd>
    <dt>How it decides</dt>
    <dd>ALLOW lets the call through, DENY blocks it, and REQUIRE_APPROVAL pauses execution until you approve or deny in the Owner Portal.</dd>
    <dt>Profiles</dt>
    <dd>Profiles define how MCP tools map to OpenLeash action types. Each profile covers a specific upstream server (e.g. office365-outlook).</dd>
  </dl>`;

export function copyableId(fullId: string, _truncateLength?: number): string {
  const escaped = escapeHtml(fullId);
  return `<span class="mono copyable" title="Click to copy" onclick="event.stopPropagation();copyId(this,'${escaped}')">${escaped}</span>`;
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
      table-layout: fixed;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    tbody td:has(.badge), tbody td:has(.btn), tbody td:has(.material-symbols-outlined), tbody td:has(.chevron) {
      overflow: visible;
      text-overflow: clip;
    }

    .accordion-detail td {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
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

    /* Flow diagram */
    .flow-diagram {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: 16px 8px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border-subtle);
      overflow-x: auto;
      white-space: nowrap;
    }

    .flow-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      flex-shrink: 0;
    }

    .flow-node[title] {
      cursor: help;
    }

    .flow-node .material-symbols-outlined {
      font-size: 36px;
      color: var(--text-secondary);
    }

    .flow-node > svg {
      width: 36px;
      height: 36px;
      color: var(--green-bright);
    }

    .flow-node-label {
      font-size: 12px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }

    .flow-arrow {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      padding: 0 2px;
    }

    .flow-arrow-line {
      width: 44px;
      height: 2px;
      background: var(--text-muted);
    }

    .flow-arrow-head {
      width: 0;
      height: 0;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 8px solid var(--text-muted);
    }

    .flow-arrow-allow .flow-arrow-line { background: var(--green-bright); }
    .flow-arrow-allow .flow-arrow-head { border-left-color: var(--green-bright); }
    .flow-arrow-deny .flow-arrow-line { background: var(--red); }
    .flow-arrow-deny .flow-arrow-head { border-left-color: var(--red); }
    .flow-arrow-pending .flow-arrow-line { background: var(--amber); }
    .flow-arrow-pending .flow-arrow-head { border-left-color: var(--amber); }

    .flow-result-allow .material-symbols-outlined { color: var(--green-bright); }
    .flow-result-deny .material-symbols-outlined { color: var(--red); }
    .flow-result-pending .material-symbols-outlined { color: var(--amber); }
    .flow-result-proof .material-symbols-outlined { color: var(--green-bright); }

    .flow-arrow-label {
      font-size: 10px;
      color: var(--text-muted);
      position: relative;
      top: -10px;
      margin: 0 -10px;
      text-align: center;
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
      position: fixed;
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
      z-index: 10000;
    }
    .copy-tooltip.show { opacity: 1; }

    /* Info popover */
    .info-popover-wrap { display: inline-flex; align-items: center; vertical-align: middle; }
    .info-trigger {
      font-size: 16px;
      color: var(--text-muted);
      cursor: pointer;
      margin-left: 6px;
      transition: color 0.15s var(--ease-out);
      user-select: none;
      line-height: 1;
    }
    .info-trigger:hover, .info-trigger:focus { color: var(--text-secondary); }
    .info-popover {
      display: none;
      position: fixed;
      background: var(--bg-surface);
      border: 1px solid var(--border-accent);
      border-radius: var(--radius-md);
      padding: 16px;
      min-width: 300px;
      max-width: 420px;
      z-index: 900;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }
    .info-popover::before {
      content: '';
      position: absolute;
      top: -6px;
      left: var(--arrow-left, 50%);
      width: 10px;
      height: 10px;
      background: var(--bg-surface);
      border-left: 1px solid var(--border-accent);
      border-top: 1px solid var(--border-accent);
      transform: rotate(45deg);
    }
    .info-popover.open { display: block; }
    .info-popover .info-title { font-weight: 600; color: var(--text-primary); font-size: 12px; margin-bottom: 8px; }
    .info-popover dl { margin: 0; }
    .info-popover dt { font-weight: 600; color: var(--text-primary); margin-top: 6px; }
    .info-popover dt:first-child { margin-top: 0; }
    .info-popover dd { margin: 0 0 0 0; color: var(--text-secondary); }

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
    function closeAllPopovers(){document.querySelectorAll('.info-popover.open').forEach(function(p){p.classList.remove('open');var orig=document.querySelector('[data-info-return="'+p.id+'"]');if(orig){orig.appendChild(p);orig.removeAttribute('data-info-return');}});}
    function toggleInfo(e,id){e.stopPropagation();var el=document.getElementById(id);if(!el)return;var wasOpen=el.classList.contains('open');closeAllPopovers();if(!wasOpen){var wrap=el.parentElement;if(wrap)wrap.setAttribute('data-info-return',id);document.body.appendChild(el);var trigger=e.currentTarget;var tr=trigger.getBoundingClientRect();el.style.left='-9999px';el.style.top='-9999px';el.classList.add('open');var pr=el.getBoundingClientRect();var left=tr.left+tr.width/2-pr.width/2;var top=tr.bottom+8;if(left<8)left=8;if(left+pr.width>window.innerWidth-8)left=window.innerWidth-8-pr.width;if(top+pr.height>window.innerHeight-8){top=tr.top-pr.height-8;}el.style.left=left+'px';el.style.top=top+'px';el.style.setProperty('--arrow-left',(tr.left+tr.width/2-left)+'px');}};
    document.addEventListener('click',function(e){if(!e.target.closest('.info-popover') && !e.target.closest('.info-trigger')){closeAllPopovers();}});
    function copyId(el,id){navigator.clipboard.writeText(id);var t=el._copyTooltip;if(!t){t=document.createElement('span');t.className='copy-tooltip';t.textContent='Copied!';document.body.appendChild(t);el._copyTooltip=t;}var r=el.getBoundingClientRect();t.style.left=r.left+r.width/2-t.offsetWidth/2+'px';t.style.top=r.top-t.offsetHeight-6+'px';t.classList.add('show');clearTimeout(el._copyTimer);el._copyTimer=setTimeout(function(){t.classList.remove('show');},1200);}
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
