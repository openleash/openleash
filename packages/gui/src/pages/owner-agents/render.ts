import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_AGENT_STATUS,
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
}

export function renderOwnerAgents(agents: OwnerAgentEntry[], options?: OwnerAgentsOptions): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const disableActions = requireTotp && !totpEnabled;
    const rows =
        agents.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No agents registered</td></tr>'
            : agents
                  .map((a) => {
                      const badge = a.status === "ACTIVE" ? "badge-green" : "badge-red";
                      return `
      <tr>
        <td>${copyableId(a.agent_id, a.agent_id.length)}</td>
        <td>${copyableId(a.agent_principal_id)}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${formatTimestamp(a.created_at)}</td>
        <td>
          ${
              a.status === "ACTIVE"
                  ? `<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;border-color:var(--color-danger);color:var(--color-danger)" data-revoke-agent="${a.agent_principal_id}" ${disableActions ? "disabled" : ""}>Revoke</button>`
                  : '<span style="color:var(--text-muted)">-</span>'
          }
        </td>
      </tr>`;
                  })
                  .join("");

    const content = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2>My Agents</h2>
      <button class="btn btn-primary" id="btn-create-invite">+ Create Agent Invite</button>
    </div>

    ${
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error" style="margin-bottom:16px">Two-factor authentication is required to revoke agents. <a href="/gui/owner/profile" style="color:inherit;text-decoration:underline">Set up 2FA in your Profile.</a></div>'
            : ""
    }

    <div id="invite-result" class="card" style="display:none;border-color:color-mix(in srgb, var(--color-warning) 30%, transparent)">
      <div style="font-size:13px;font-weight:600;color:var(--color-warning);margin-bottom:12px">Agent Invite URL (single use, expires in 24h)</div>
      <div id="invite-url" style="padding:10px 14px;background:var(--bg-elevated);border:1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);border-radius:8px;font-family:var(--font-mono);font-size:12px;word-break:break-all;line-height:1.5;color:var(--text-primary)"></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:12px;padding:6px 16px" id="btn-copy-invite">Copy to Clipboard</button>
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 16px" id="btn-dismiss-invite">Dismiss</button>
      </div>
    </div>

    <div class="card" style="padding:0;margin-top:20px">
      <table>
        <colgroup><col><col style="width:290px"><col style="width:130px"><col style="width:170px"><col style="width:140px"></colgroup>
        <thead>
          <tr><th>Agent ID</th><th>Principal ID</th><th>Status${infoIcon("owner-agent-status", INFO_AGENT_STATUS)}</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>window.__PAGE_DATA__ = { totpEnabled: ${totpEnabled} };</script>
    ${assetTags("pages/owner-agents/client.ts")}
  `;
    return renderPage("My Agents", content, "/gui/owner/agents", "owner");
}
