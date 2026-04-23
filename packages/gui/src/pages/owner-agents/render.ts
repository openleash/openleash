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
}

export interface OwnerAgentsOptions {
    totp_enabled?: boolean;
    require_totp?: boolean;
    /**
     * Scope-implied owner for the "create invite" action. The invite targets
     * the current scope's owner (personal or org) — switch scope via the
     * sidebar to invite an agent for a different owner.
     */
    ownerType: "user" | "org";
    ownerId: string;
    ownerDisplayName: string;
}

export function renderOwnerAgents(agents: OwnerAgentEntry[], options?: OwnerAgentsOptions, renderPageOptions?: RenderPageOptions): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const disableActions = requireTotp && !totpEnabled;
    const rows =
        agents.length === 0
            ? '<tr><td colspan="4" class="agents-empty-row">No agents registered</td></tr>'
            : agents
                  .map((a) => {
                      const badge = a.status === "ACTIVE" ? "badge-green" : "badge-red";
                      return `
      <tr>
        <td><a href="/gui/agents/${escapeHtml(a.agent_principal_id)}" class="table-link">${escapeHtml(a.agent_id)}</a>${idBadge(a.agent_principal_id)}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
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

    const ownerType = options?.ownerType ?? "user";
    const ownerId = options?.ownerId ?? "";
    const ownerDisplayName = options?.ownerDisplayName ?? "";
    const scopeLabel = ownerType === "org" ? "Organization Agents" : "My Agents";

    const content = `
    <div class="agents-header">
      <h2>${escapeHtml(scopeLabel)}</h2>
      <button class="btn btn-primary" id="btn-create-invite">+ Create Agent Invite</button>
    </div>

    ${
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error agents-totp-banner">Two-factor authentication is required to revoke agents. <a href="/gui/profile" class="agents-totp-link">Set up 2FA in your Profile.</a></div>'
            : ""
    }

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
        <colgroup><col><col style="width:290px"><col style="width:250px"><col style="width:170px"><col style="width:140px"></colgroup>
        <thead>
          <tr><th>Agent</th><th>Status${infoIcon("owner-agent-status", INFO_AGENT_STATUS)}</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>window.__PAGE_DATA__ = ${JSON.stringify({
        totpEnabled,
        ownerType,
        ownerId,
        ownerDisplayName,
    })};</script>
    ${assetTags("pages/owner-agents/client.ts")}
  `;
    return renderPage("My Agents", content, "/gui/agents", "owner", renderPageOptions);
}
