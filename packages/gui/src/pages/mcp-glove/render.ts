import { renderPage, escapeHtml, infoIcon, INFO_MCP_GLOVE } from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface McpGlovePageData {
    agents: { agent_id: string; display_name: string; owner_principal_id: string }[];
    owners: { owner_principal_id: string; display_name: string }[];
    server_url: string;
    glove_activity: { total: number; allow: number; deny: number; require_approval: number };
}

const PROFILE_TOOL_MAPPINGS = [
    {
        tool: "outlook_create_draft_email",
        action: "communication.email.draft",
        type: "write",
        description: "Create a draft email",
    },
    {
        tool: "outlook_send_email",
        action: "communication.email.send",
        type: "write",
        description: "Send an email",
    },
    {
        tool: "outlook_reply_to_email",
        action: "communication.email.reply",
        type: "write",
        description: "Reply to an email",
    },
    {
        tool: "outlook_forward_email",
        action: "communication.email.forward",
        type: "write",
        description: "Forward an email",
    },
    {
        tool: "outlook_delete_email",
        action: "communication.email.delete",
        type: "write",
        description: "Delete an email",
    },
];

const PROFILE_PAYLOAD_FIELDS = [
    { field: "to_recipients", type: "string[]", description: "Email addresses of recipients" },
    { field: "cc_recipients", type: "string[]", description: "CC email addresses" },
    { field: "subject", type: "string", description: "Email subject line" },
    { field: "body_preview", type: "string", description: "First 200 characters of email body" },
    {
        field: "email_id",
        type: "string",
        description: "ID of email being acted upon (reply/forward/delete)",
    },
];

export function renderMcpGlove(data: McpGlovePageData): string {
    const { agents, owners, server_url, glove_activity } = data;

    const ownerMap = new Map(owners.map((o) => [o.owner_principal_id, o.display_name]));

    const agentOptions = agents
        .map((a) => {
            const ownerName =
                ownerMap.get(a.owner_principal_id) ?? a.owner_principal_id.slice(0, 8);
            return `<option value="${escapeHtml(a.agent_id)}">${escapeHtml(a.display_name || a.agent_id)} (${escapeHtml(ownerName)})</option>`;
        })
        .join("\n");

    const toolRows = PROFILE_TOOL_MAPPINGS.map(
        (m) =>
            `<tr>
      <td class="mono">${escapeHtml(m.tool)}</td>
      <td class="mono">${escapeHtml(m.action)}</td>
      <td><span class="badge badge-amber">${escapeHtml(m.type)}</span></td>
      <td>${escapeHtml(m.description)}</td>
    </tr>`,
    ).join("");

    const payloadRows = PROFILE_PAYLOAD_FIELDS.map(
        (f) =>
            `<tr>
      <td class="mono">${escapeHtml(f.field)}</td>
      <td><span class="badge badge-muted">${escapeHtml(f.type)}</span></td>
      <td>${escapeHtml(f.description)}</td>
    </tr>`,
    ).join("");

    const act = glove_activity;

    const content = `
    <div class="page-header">
      <h2>MCP Glove${infoIcon("mcp-glove-info", INFO_MCP_GLOVE)}</h2>
      <p>Transparent MCP governance proxy &mdash; wraps upstream MCP servers and enforces OpenLeash policies on tool calls</p>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Calls</div>
        <div class="value">${act.total}</div>
      </div>
      <div class="summary-card">
        <div class="label">Allowed</div>
        <div class="value text-success">${act.allow}</div>
      </div>
      <div class="summary-card">
        <div class="label">Denied</div>
        <div class="value text-danger">${act.deny}</div>
      </div>
      <div class="summary-card">
        <div class="label">Approval Required</div>
        <div class="value glove-text-warning">${act.require_approval}</div>
      </div>
    </div>

    ${act.total > 0 ? `<div class="glove-audit-link"><a href="/gui/admin/audit?filter=communication." class="btn btn-secondary glove-btn-audit">View filtered audit log</a></div>` : ""}

    <div class="card">
      <div class="card-title">Config Generator</div>
      <p class="glove-description">
        Generate the MCP client JSON config snippet to add to your MCP client configuration (e.g. Claude Desktop, Cursor).
      </p>
      <div class="glove-config-grid">
        <div>
          <div class="form-group">
            <label>Profile</label>
            <select id="glove-profile" class="form-select">
              <option value="office365-outlook">office365-outlook</option>
            </select>
          </div>
          <div class="form-group">
            <label>Agent</label>
            <select id="glove-agent" class="form-select">
              ${agents.length === 0 ? '<option value="">No agents registered</option>' : agentOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Upstream Command</label>
            <input id="glove-upstream" type="text" class="form-input" value="npx -y @jbctechsolutions/mcp-outlook-mac">
            <div class="form-help">The command to start the upstream MCP server</div>
          </div>
          <div class="form-group">
            <label>OpenLeash URL</label>
            <input id="glove-url" type="text" class="form-input" value="${escapeHtml(server_url)}">
          </div>
          <div class="form-group">
            <label>Approval Timeout (ms)</label>
            <input id="glove-timeout" type="number" class="form-input" value="120000">
            <div class="form-help">How long to wait for owner approval before timing out</div>
          </div>
        </div>
        <div>
          <label class="glove-config-label">Generated Config</label>
          <pre id="glove-output" class="config-block glove-config-output"></pre>
          <button id="btn-copy-glove" class="btn btn-primary glove-btn-copy">Copy to Clipboard</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Profile Reference: office365-outlook</div>
      <p class="glove-description">
        Tool-to-action mappings used by the <span class="mono">office365-outlook</span> glove profile.
      </p>
      <h4 class="glove-ref-heading">Tool Mappings</h4>
      <table>
        <colgroup><col style="width:200px"><col style="width:180px"><col style="width:100px"><col></colgroup>
        <thead>
          <tr><th>MCP Tool</th><th>Action Type</th><th>Kind</th><th>Description</th></tr>
        </thead>
        <tbody>${toolRows}</tbody>
      </table>

      <h4 class="glove-ref-heading-spaced">Extracted Payload Fields</h4>
      <table>
        <colgroup><col style="width:200px"><col style="width:120px"><col></colgroup>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>${payloadRows}</tbody>
      </table>
    </div>

    ${assetTags("pages/mcp-glove/client.ts")}
  `;

    return renderPage("MCP Glove", content, "/gui/admin/mcp-glove");
}
