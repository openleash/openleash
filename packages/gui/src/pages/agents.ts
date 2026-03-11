import {
    renderPage,
    escapeHtml,
    formatNameWithId,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_AGENT_STATUS,
} from "../layout.js";
import { assetTags } from "../manifest.js";

export interface AgentData {
    agent_principal_id: string;
    agent_id?: string;
    owner_principal_id?: string;
    status?: string;
    created_at?: string;
    revoked_at?: string | null;
    error?: string;
}

export interface OwnerOption {
    owner_principal_id: string;
    display_name: string;
}

function statusBadge(status?: string): string {
    if (!status) return '<span class="badge badge-muted">UNKNOWN</span>';
    switch (status) {
        case "ACTIVE":
            return '<span class="badge badge-green">ACTIVE</span>';
        case "REVOKED":
            return '<span class="badge badge-red">REVOKED</span>';
        default:
            return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
    }
}

export function renderAgents(agents: AgentData[], owners: OwnerOption[]): string {
    const ownerMap = new Map(owners.map((o) => [o.owner_principal_id, o.display_name]));

    const rows = agents
        .map(
            (a) => `
    <tr>
      <td>${a.agent_id ? copyableId(a.agent_id, a.agent_id.length) : "-"}</td>
      <td>${copyableId(a.agent_principal_id)}</td>
      <td>${a.owner_principal_id ? formatNameWithId(ownerMap.get(a.owner_principal_id), a.owner_principal_id) : "-"}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${a.created_at ? formatTimestamp(a.created_at, true) : "-"}</td>
      <td class="mono">${a.revoked_at ? formatTimestamp(a.revoked_at, true) : "-"}</td>
    </tr>
  `,
        )
        .join("");

    const ownerOptions = owners
        .map(
            (o) =>
                `<option value="${escapeHtml(o.owner_principal_id)}">${escapeHtml(o.display_name)} (${escapeHtml(o.owner_principal_id.slice(0, 8))}...)</option>`,
        )
        .join("");

    const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>Agents</h2>
        <p>${agents.length} registered agent${agents.length !== 1 ? "s" : ""}</p>
      </div>
      <button class="btn btn-primary" onclick="toggleInviteForm()">+ Create Agent Invite</button>
    </div>

    <div id="invite-form" class="card hidden">
      <div class="card-title">Create Agent Invite</div>

      <div class="form-group">
        <label for="owner-select">Owner</label>
        <select id="owner-select" class="form-select">
          ${ownerOptions || "<option disabled>No owners available</option>"}
        </select>
        <div class="field-error" id="err-owner-select"></div>
        <div class="form-help">The agent will be registered under this owner</div>
      </div>

      <div class="toolbar">
        <button id="invite-btn" class="btn btn-primary" onclick="createAgentInvite()">Create Invite</button>
        <button class="btn btn-secondary" onclick="toggleInviteForm()">Cancel</button>
      </div>
    </div>

    <div id="invite-result" class="card hidden" style="border-color:color-mix(in srgb, var(--color-warning) 30%, transparent)">
      <div style="font-size:13px;font-weight:600;color:var(--color-warning);margin-bottom:12px">Agent Invite URL (single use, expires in 24h)</div>
      <div id="invite-url" style="padding:10px 14px;background:var(--bg-elevated);border:1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);border-radius:8px;font-family:var(--font-mono);font-size:12px;word-break:break-all;line-height:1.5;color:var(--text-primary)"></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Copy this URL and give it to the agent. It contains everything the agent needs to register itself.</div>
      <div class="toolbar" style="margin-top:12px">
        <button class="btn btn-primary" onclick="copyInviteUrl()">Copy to Clipboard</button>
        <button class="btn btn-secondary" onclick="document.getElementById('invite-result').classList.add('hidden')">Dismiss</button>
      </div>
    </div>

    <div class="card">
      <table>
        <colgroup><col><col style="width:290px"><col style="width:290px"><col style="width:130px"><col style="width:170px"><col style="width:170px"></colgroup>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Principal ID</th>
            <th>Owner</th>
            <th>Status${infoIcon("agents-status", INFO_AGENT_STATUS)}</th>
            <th>Created</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">No agents registered</td></tr>'}
        </tbody>
      </table>
    </div>

    ${assetTags("pages/agents.ts")}
  `;

    return renderPage("Agents", content, "/gui/agents");
}
