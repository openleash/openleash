import {
    renderPage,
    escapeHtml,
    idBadge,
    formatTimestamp,
    infoIcon,
    INFO_AGENT_STATUS,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerAgentEntry {
    agent_principal_id: string;
    agent_id: string;
    status: string;
    created_at: string;
    revoked_at: string | null;
    webhook_url: string;
}

export interface OwnerAgentOwnerOption {
    id: string;
    display_name: string;
    type: "user" | "org";
}

export interface OwnerAgentsOptions {
    totp_enabled?: boolean;
    require_totp?: boolean;
    ownerOptions?: OwnerAgentOwnerOption[];
}

export function renderOwnerAgents(agents: OwnerAgentEntry[], options?: OwnerAgentsOptions, renderPageOptions?: RenderPageOptions): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const disableActions = requireTotp && !totpEnabled;
    const rows =
        agents.length === 0
            ? '<tr><td colspan="5" class="agents-empty-row">No agents registered</td></tr>'
            : agents
                  .map((a) => {
                      const badge = a.status === "ACTIVE" ? "badge-green" : "badge-red";
                      return `
      <tr>
        <td><a href="/gui/agents/${escapeHtml(a.agent_principal_id)}" class="table-link">${escapeHtml(a.agent_id)}</a>${idBadge(a.agent_principal_id)}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td class="mono text-ellipsis" title="${a.webhook_url ? escapeHtml(a.webhook_url) : ''}">${a.webhook_url ? escapeHtml(a.webhook_url) : "-"}</td>
        <td>${formatTimestamp(a.created_at)}</td>
        <td>
          ${
              a.status === "ACTIVE"
                  ? `<button class="btn btn-secondary agents-btn-revoke" data-revoke-agent="${a.agent_principal_id}" ${disableActions ? "disabled" : ""}>Revoke</button>`
                  : '<span class="text-muted">-</span>'
          }
        </td>
      </tr>`;
                  })
                  .join("");

    const content = `
    <div class="agents-header">
      <h2>My Agents</h2>
      <button class="btn btn-primary" id="btn-create-invite">+ Create Agent Invite</button>
    </div>

    ${
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error agents-totp-banner">Two-factor authentication is required to revoke agents. <a href="/gui/profile" class="agents-totp-link">Set up 2FA in your Profile.</a></div>'
            : ""
    }

    ${(() => {
        const ownerOpts = options?.ownerOptions ?? [];
        if (ownerOpts.length <= 1) return "";
        const optionsHtml = ownerOpts.map((o) =>
            `<option value="${escapeHtml(o.id)}" data-type="${escapeHtml(o.type)}">${o.type === "org" ? "🏢 " : "👤 "}${escapeHtml(o.display_name)}</option>`,
        ).join("");
        return `
    <div id="invite-owner-select" class="hidden" style="margin-bottom:12px">
      <div class="form-group">
        <label class="form-label" for="agent-owner">Create invite for</label>
        <select id="agent-owner" class="form-select">${optionsHtml}</select>
        <div class="form-help">The agent will be registered under the selected owner</div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="btn-confirm-invite">Create Invite</button>
        <button class="btn btn-secondary" id="btn-cancel-invite-select">Cancel</button>
      </div>
    </div>`;
    })()}

    <div id="invite-result" class="card hidden agents-invite-card">
      <div class="agents-invite-title">Agent Invite URL (single use, expires in 24h)</div>
      <div id="invite-url" class="agents-invite-url"></div>
      <div class="agents-invite-hint">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
      <div class="agents-invite-actions">
        <button class="btn btn-primary agents-invite-btn" id="btn-copy-invite">Copy to Clipboard</button>
        <button class="btn btn-secondary agents-invite-btn" id="btn-dismiss-invite">Dismiss</button>
      </div>
    </div>

    <div class="card agents-card">
      <table>
        <colgroup><col><col style="width:290px"><col style="width:130px"><col style="width:250px"><col style="width:170px"><col style="width:140px"></colgroup>
        <thead>
          <tr><th>Agent</th><th>Status${infoIcon("owner-agent-status", INFO_AGENT_STATUS)}</th><th>Webhook</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>window.__PAGE_DATA__ = { totpEnabled: ${totpEnabled} };</script>
    ${assetTags("pages/owner-agents/client.ts")}
  `;
    return renderPage("My Agents", content, "/gui/agents", "owner", renderPageOptions);
}
