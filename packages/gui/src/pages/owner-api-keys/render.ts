import {
    renderPage,
    escapeHtml,
    idBadge,
    formatTimestamp,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerApiKeyListEntry {
    api_key_id: string;
    name: string;
    scopes: string[];
    status: "ACTIVE" | "REVOKED";
    created_at: string;
    revoked_at: string | null;
    last_used_at: string | null;
}

export interface OwnerApiKeysOptions {
    /** API base for key management, e.g. `/v1/owner` or `/v1/owner/organizations/<id>`. */
    apiBase: string;
    /** Sidebar path of this page, for the active nav item. */
    activePath: string;
    /** Org viewers/members may see keys but only admins create or revoke them. */
    canManage: boolean;
}

export function renderOwnerApiKeys(
    apiKeys: OwnerApiKeyListEntry[],
    options: OwnerApiKeysOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const { apiBase, activePath, canManage } = options;
    const exportPath = `${apiBase}/audit/export`;

    const rows =
        apiKeys.length === 0
            ? '<tr><td colspan="5" class="oak-empty-row">No API keys yet.</td></tr>'
            : apiKeys
                .map(
                    (k) => `
      <tr>
        <td>${escapeHtml(k.name)}${idBadge(k.api_key_id)}</td>
        <td>${k.scopes.map((s) => `<code class="mono">${escapeHtml(s)}</code>`).join(" ")}</td>
        <td><span class="badge ${k.status === "ACTIVE" ? "badge-green" : "badge-red"}">${k.status}</span></td>
        <td>${k.last_used_at ? formatTimestamp(k.last_used_at) : '<span class="text-muted">never</span>'}</td>
        <td>${
            k.status !== "ACTIVE"
                ? formatTimestamp(k.revoked_at ?? "")
                : canManage
                    ? `<button class="btn btn-danger btn-sm oak-revoke" data-id="${k.api_key_id}" data-name="${escapeHtml(k.name)}">Revoke</button>`
                    : ""
        }</td>
      </tr>`,
                )
                .join("");

    const content = `
    <div class="agents-header">
      <h2>API Keys</h2>
      ${canManage ? '<button class="btn btn-primary" id="btn-show-create">+ New API Key</button>' : ""}
    </div>

    <p class="oak-help">
      API keys give integrations such as a SIEM or log collector read access to
      this account's audit log. A key can only do what its scopes allow —
      <code class="mono">audit:read</code> reads the audit export and nothing else.
      ${canManage ? "" : "Only organization admins can create or revoke keys."}
    </p>

    <div id="oak-root" data-api-base="${escapeHtml(apiBase)}">
    <div id="create-panel" class="card oak-panel hidden">
      <div class="card-title">Create API Key</div>
      <div class="form-group">
        <label for="key-name">Name</label>
        <input type="text" id="key-name" class="form-input" placeholder="e.g. splunk-prod">
        <div class="field-error" id="err-key-name"></div>
      </div>
      <div class="toolbar">
        <button id="btn-create-cancel" class="btn btn-secondary">Cancel</button>
        <button id="btn-create" class="btn btn-primary">Create</button>
      </div>
    </div>

    <div id="token-panel" class="card oak-panel hidden">
      <div class="card-title">API key — shown only once</div>
      <p class="oak-muted">
        Copy this key into your log collector now. It is not stored and cannot
        be shown again — if it is lost, revoke it and create a new one.
      </p>
      <div class="oak-token-row">
        <code id="token-value" class="mono oak-token-value"></code>
        <button class="btn btn-secondary btn-sm" id="btn-copy-token">Copy</button>
      </div>
    </div>
    </div>

    <div class="card oak-list-card">
      <table>
        <colgroup><col><col style="width:140px"><col style="width:110px"><col style="width:180px"><col style="width:160px"></colgroup>
        <thead>
          <tr><th>Name</th><th>Scopes</th><th>Status</th><th>Last used</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="card oak-panel">
      <div class="card-title"><span class="material-symbols-outlined oak-title-icon">integration_instructions</span>Exporting the audit log</div>
      <p class="oak-muted">
        Poll the export endpoint with a key. Events come oldest first in
        <a href="https://schema.ocsf.io/1.3.0" target="_blank" rel="noopener">OCSF 1.3.0</a>
        (add <code class="mono">format=native</code> for OpenLeash's own format).
        Store <code class="mono">next_cursor</code> and pass it back as
        <code class="mono">cursor</code> to receive only new events; use
        <code class="mono">since=&lt;ISO timestamp&gt;</code> for the first request.
        Add <code class="mono">output=ndjson</code> for newline-delimited output, with the cursor in the
        <code class="mono">OpenLeash-Next-Cursor</code> header.
      </p>
      <pre class="mono oak-snippet" id="oak-snippet" data-path="${escapeHtml(exportPath)}">curl -H "Authorization: Bearer $OPENLEASH_API_KEY" \\
  "${escapeHtml(exportPath)}?limit=500"</pre>
    </div>

    ${assetTags("pages/owner-api-keys/client.ts")}
  `;

    return renderPage("API Keys", content, activePath, "owner", renderPageOptions);
}
