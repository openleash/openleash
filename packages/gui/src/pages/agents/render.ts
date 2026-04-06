import {
    renderPage,
    escapeHtml,
    formatNameWithId,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_AGENT_STATUS,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface AgentData {
    agent_principal_id: string;
    agent_id: string;
    owner_type: string;
    owner_id: string;
    status: string;
    created_at: string;
    revoked_at: string | null;
    webhook_url: string;
    error?: string;
}

export interface OwnerOption {
    id: string;
    display_name: string;
}

function statusBadge(status: string): string {
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
    const ownerMap = new Map(owners.map((o) => [o.id, o.display_name]));

    const rows = agents
        .map(
            (a) => `
    <tr>
      <td>${copyableId(a.agent_id, a.agent_id.length)}</td>
      <td>${copyableId(a.agent_principal_id)}</td>
      <td>${formatNameWithId(ownerMap.get(a.owner_id), a.owner_id)}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono text-ellipsis" title="${a.webhook_url ? escapeHtml(a.webhook_url) : ""}">${a.webhook_url ? escapeHtml(a.webhook_url) : "-"}</td>
      <td class="mono">${a.created_at ? formatTimestamp(a.created_at, true) : "-"}</td>
      <td class="mono">${a.revoked_at ? formatTimestamp(a.revoked_at, true) : "-"}</td>
    </tr>
  `,
        )
        .join("");

    const ownerOptions = owners
        .map(
            (o) =>
                `<option value="${escapeHtml(o.id)}">${escapeHtml(o.display_name)} (${escapeHtml(o.id.slice(0, 8))}...)</option>`,
        )
        .join("");

    const content = `
    <div class="page-header agents-page-header">
      <div>
        <h2>Agents</h2>
        <p>${agents.length} registered agent${agents.length !== 1 ? "s" : ""}</p>
      </div>
      <button class="btn btn-primary" data-toggle-invite>+ Create Agent Invite</button>
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
        <button id="invite-btn" class="btn btn-primary">Create Invite</button>
        <button class="btn btn-secondary" data-toggle-invite>Cancel</button>
      </div>
    </div>

    <div id="invite-result" class="card hidden agents-invite-result">
      <div class="agents-invite-heading">Agent Invite URL (single use, expires in 24h)</div>
      <div id="invite-url" class="agents-invite-url"></div>
      <div class="agents-invite-hint">Copy this URL and give it to the agent. It contains everything the agent needs to register itself.</div>
      <div class="toolbar agents-invite-toolbar">
        <button id="btn-copy-invite" class="btn btn-primary">Copy to Clipboard</button>
        <button id="btn-dismiss-invite" class="btn btn-secondary">Dismiss</button>
      </div>
    </div>

    <div class="card">
      <table>
        <colgroup><col style="width:130px"><col style="width:290px"><col style="width:290px"><col style="width:130px"><col style="width:250px"><col style="width:130px"><col style="width:100px"></colgroup>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Principal ID</th>
            <th>Owner</th>
            <th>Status${infoIcon("agents-status", INFO_AGENT_STATUS)}</th>
            <th>Webhook</th>
            <th>Created</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" class="agents-table-empty">No agents registered</td></tr>'}
        </tbody>
      </table>
    </div>

    ${assetTags("pages/agents/client.ts")}
  `;

    return renderPage("Agents", content, "/gui/admin/agents");
}
