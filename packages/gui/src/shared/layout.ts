import dayjs from "dayjs";
import { assetTags } from "./manifest.js";

let _version = "";
let _commitHash = "";

/**
 * Logo SVG markup for standalone auth pages (login, setup).
 * The full lobster mark with gradient, claws, eyes, collar, and leash.
 */
export const AUTH_LOGO_SVG = `<svg class="auth-logo" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="OpenLeash logo">
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
</svg>`;

/**
 * Render the branding header for standalone auth pages.
 * Includes the lobster logo, gradient title, and tagline.
 */
export function authBrandHtml(subtitle: string): string {
    return `<div class="auth-brand">
    ${AUTH_LOGO_SVG}
    <h1>OpenLeash</h1>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
    <div class="auth-tagline">Authorization guardrails for AI agents</div>
  </div>`;
}

export function setVersion(v: string, commitHash?: string): void {
    _version = v;
    _commitHash = commitHash ?? "";
}

const NAV_ITEMS = [
    { path: "/gui/admin/dashboard", label: "Dashboard", icon: "dashboard" },
    { path: "/gui/admin/owners", label: "Owners", icon: "group" },
    { path: "/gui/admin/agents", label: "Agents", icon: "smart_toy" },
    { path: "/gui/admin/policies", label: "Policies", icon: "policy" },
    { path: "/gui/admin/config", label: "Config", icon: "settings" },
    { path: "/gui/admin/mcp-glove", label: "MCP Glove", icon: "handshake" },
    { path: "/gui/admin/audit", label: "Audit Log", icon: "receipt_long" },
    { path: "/gui/admin/api-reference", label: "API Docs", icon: "api" },
];

const OWNER_NAV_ITEMS = [
    { path: "/gui/dashboard", label: "Dashboard", icon: "dashboard" },
    { path: "/gui/profile", label: "Profile", icon: "account_circle" },
    { path: "/gui/agents", label: "My Agents", icon: "smart_toy" },
    { path: "/gui/policies", label: "My Policies", icon: "policy" },
    { path: "/gui/approvals", label: "Approvals", icon: "task_alt" },
    { path: "/gui/audit", label: "Audit Log", icon: "receipt_long" },
];

function escapeHtml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export { escapeHtml };

/**
 * Render an info icon with a click-to-toggle popover.
 * @param id   Unique identifier (used as DOM id suffix)
 * @param html Rich HTML content for the popover body
 */
export function infoIcon(id: string, html: string): string {
    return `<span class="info-popover-wrap"><span class="material-symbols-outlined info-trigger" data-info-id="info-${escapeHtml(id)}" tabindex="0" role="button" aria-label="More info">info</span><div class="info-popover" id="info-${escapeHtml(id)}">${html}</div></span>`;
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
    return `<span class="mono copyable" title="Click to copy" data-copy-id="${escaped}">${escaped}</span>`;
}

export function formatTimestamp(iso: string, dateOnly = false): string {
    const escaped = escapeHtml(iso);
    const d = dayjs(iso);
    const fallback = dateOnly ? d.format("YYYY-MM-DD") : d.format("YYYY-MM-DD HH:mm:ss");
    return `<span class="local-time" data-utc="${escaped}"${dateOnly ? ' data-date-only="1"' : ""} title="UTC: ${escapeHtml(fallback)}" style="white-space:nowrap">${escapeHtml(fallback)}</span>`;
}

export function formatNameWithId(name: string | undefined, uuid: string): string {
    const escaped = escapeHtml(uuid);
    if (name) {
        return `${escapeHtml(name)} <span class="mono muted copyable" title="Click to copy" data-copy-id="${escaped}" style="color:var(--text-muted);font-size:11px">(${escapeHtml(uuid)})</span>`;
    }
    return `<span class="mono truncate copyable" title="Click to copy" data-copy-id="${escaped}">${escapeHtml(uuid)}</span>`;
}

export interface RenderPageOptions {
    showContextSwitcher?: boolean;
    isAdmin?: boolean;
    extraOwnerNavItems?: { path: string; label: string; icon: string }[];
    extraAdminNavItems?: { path: string; label: string; icon: string }[];
    verificationProviders?: string[];
    isHosted?: boolean;
    extraHeadHtml?: string;
    extraBodyHtml?: string;
}

export function renderPage(
    title: string,
    content: string,
    activePath: string,
    context?: "admin" | "owner",
    options?: RenderPageOptions,
): string {
    const isOwner = context === "owner";
    const extraItems = isOwner
        ? (options?.extraOwnerNavItems ?? [])
        : (options?.extraAdminNavItems ?? []);
    const navItems = [...(isOwner ? OWNER_NAV_ITEMS : NAV_ITEMS), ...extraItems];
    const subtitle = isOwner ? "Owner Portal" : "Authorization GUI";
    const dashboardPath = isOwner ? "/gui/dashboard" : "/gui/admin/dashboard";

    const navHtml = navItems
        .map((item) => {
            const active =
                activePath === item.path ||
                (item.path !== dashboardPath && activePath.startsWith(item.path));
            return `<a href="${item.path}" class="nav-item${active ? " active" : ""}">
      <span class="nav-icon material-symbols-outlined">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </a>`;
        })
        .join("\n");

    const showSwitcher = options?.showContextSwitcher !== false && (options?.isAdmin === true || !isOwner);

    const logoutHtml = isOwner
        ? `
    <a href="#" class="nav-item" id="nav-logout" style="color:var(--color-danger)">
      <span class="nav-icon material-symbols-outlined">logout</span>
      <span class="nav-label">Logout</span>
    </a>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - OpenLeash</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 120 120' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2334d399'/%3E%3Cstop offset='100%25' stop-color='%23065f46'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M60 10C32 10 18 30 18 48C18 66 32 80 46 84L46 88L54 88L54 84C54 84 60 86 66 84L66 88L74 88L74 84C88 80 102 66 102 48C102 30 88 10 60 10Z' fill='url(%23g)'/%3E%3Cpath d='M22 38C8 34 2 43 6 52C10 61 20 57 24 48C27 42 24 38 22 38Z' fill='url(%23g)'/%3E%3Cpath d='M98 38C112 34 118 43 114 52C110 61 100 57 96 48C93 42 96 38 98 38Z' fill='url(%23g)'/%3E%3Ccircle cx='45' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='75' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='46' cy='29' r='2' fill='%23fbbf24'/%3E%3Ccircle cx='76' cy='29' r='2' fill='%23fbbf24'/%3E%3Cpath d='M28 56C42 64 78 64 92 56' stroke='%23fbbf24' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3Cpath d='M60 62L60 98Q58 106 50 108' stroke='%23fbbf24' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3Cellipse cx='45' cy='109' rx='8' ry='4.5' fill='none' stroke='%23fbbf24' stroke-width='3'/%3E%3C/svg%3E">
  ${assetTags("shared/common.ts")}
  ${options?.extraHeadHtml ?? ''}
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
      ${
          showSwitcher
              ? `<div class="context-switcher">
        <a href="/gui/admin/dashboard" class="context-tab${!isOwner ? " active" : ""}">
          <span class="context-tab-icon material-symbols-outlined">admin_panel_settings</span>
          <span class="context-tab-label">Admin</span>
        </a>
        <a href="/gui/dashboard" class="context-tab${isOwner ? " active" : ""}">
          <span class="context-tab-icon material-symbols-outlined">person</span>
          <span class="context-tab-label">Owner</span>
        </a>
      </div>`
              : ""
      }
      <div class="theme-switcher">
        <button class="theme-btn" data-theme="system" title="System theme"><span class="material-symbols-outlined">desktop_windows</span></button>
        <button class="theme-btn" data-theme="light" title="Light theme"><span class="material-symbols-outlined">light_mode</span></button>
        <button class="theme-btn" data-theme="dark" title="Dark theme"><span class="material-symbols-outlined">dark_mode</span></button>
      </div>
    </div>
    ${navHtml}
    <div class="sidebar-bottom">
      ${_version ? `<div class="sidebar-version">${!isOwner ? `<a href="/gui/admin/about" class="sidebar-version-link">` : ""}<span>${escapeHtml(_version)}</span>${_commitHash ? `<span class="sidebar-commit">(${escapeHtml(_commitHash)})</span>` : ""}${!isOwner ? `</a>` : ""}</div>` : ""}
      ${logoutHtml}
      <button class="sidebar-toggle" title="Toggle sidebar">
        <span class="material-symbols-outlined collapse-icon">left_panel_close</span>
        <span class="material-symbols-outlined expand-icon">left_panel_open</span>
      </button>
    </div>
  </nav>
  <main class="main">
    ${content}
  </main>
  <div id="ol-dialog" class="modal-overlay">
    <div class="modal" style="max-width:420px">
      <div class="modal-title" id="ol-dialog-title"></div>
      <p id="ol-dialog-msg" style="font-size:13px;color:var(--text-secondary);margin-bottom:16px"></p>
      <div id="ol-dialog-input-wrap" style="display:none;margin-bottom:16px">
        <input type="text" id="ol-dialog-input" class="form-input" style="width:100%">
        <div class="field-error" id="err-ol-dialog-input"></div>
      </div>
      <div class="modal-footer">
        <button id="ol-dialog-cancel" class="btn btn-secondary">Cancel</button>
        <button id="ol-dialog-ok" class="btn btn-primary">OK</button>
      </div>
    </div>
  </div>
  ${options?.extraBodyHtml ?? ''}
</body>
</html>`;
}
