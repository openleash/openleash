import { escapeHtml, renderPage, type RenderPageOptions } from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface PolicyCreateGroupOption {
    group_id: string;
    name: string;
    slug: string;
}

export interface OwnerPolicyCreateOptions {
    /** Scope-implied owner — policy is created for the current scope. */
    ownerType: "user" | "org";
    ownerId: string;
    ownerDisplayName: string;
    /** Only populated for org scope. Empty array in personal scope. */
    groups?: PolicyCreateGroupOption[];
    /** Optional pre-selected group from query string (deep-link from group detail page). */
    preselectedGroupId?: string;
}

export function renderOwnerPolicyCreate(
    options: OwnerPolicyCreateOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const scopeLabel = options.ownerType === "org"
        ? `Creating policy for ${options.ownerDisplayName}`
        : "Creating personal policy";

    const groups = options.groups ?? [];
    const preselectedGroup = options.preselectedGroupId;

    const scopeSelector = options.ownerType === "org"
        ? `
      <div class="form-group">
        <label>Applies to</label>
        <div class="policy-create-scope-options">
          <label class="policy-create-radio">
            <input type="radio" name="applies-to" value="owner"${!preselectedGroup ? " checked" : ""}>
            <span>All agents in this organization</span>
          </label>
          <label class="policy-create-radio">
            <input type="radio" name="applies-to" value="group"${preselectedGroup ? " checked" : ""}${groups.length === 0 ? " disabled" : ""}>
            <span>A policy group${groups.length === 0 ? ' <span class="text-muted">(none created yet)</span>' : ""}</span>
          </label>
          <label class="policy-create-radio">
            <input type="radio" name="applies-to" value="agent">
            <span>A specific agent</span>
          </label>
        </div>
      </div>

      <div id="group-picker" class="form-group${preselectedGroup ? "" : " hidden"}">
        <label for="group-id">Group</label>
        <select id="group-id" class="form-select">
          ${groups
              .map((g) => `<option value="${escapeHtml(g.group_id)}"${g.group_id === preselectedGroup ? " selected" : ""}>${escapeHtml(g.name)} (${escapeHtml(g.slug)})</option>`)
              .join("")}
        </select>
      </div>

      <div id="agent-picker" class="form-group hidden">
        <label>Agent Principal ID</label>
        <input type="text" id="agent-id" class="form-input policy-create-agent-input" placeholder="agent_principal_id UUID">
      </div>`
        : `
      <div class="form-group">
        <label>Agent Principal ID (optional)</label>
        <input type="text" id="agent-id" class="form-input policy-create-agent-input" placeholder="Leave empty for all agents">
      </div>`;

    const content = `
    <h2>Create Policy</h2>
    <p class="policy-create-scope-hint text-muted">${escapeHtml(scopeLabel)}</p>

    <div class="card policy-create-card">
      <div class="policy-create-fields">
        <div class="form-group policy-create-field-name">
          <label>Name</label>
          <input type="text" id="policy-name" class="form-input" placeholder="e.g. Read-only access">
        </div>
        <div class="form-group policy-create-field-desc">
          <label>Description</label>
          <input type="text" id="policy-desc" class="form-input" placeholder="What does this policy do?">
        </div>
      </div>
      ${scopeSelector}
      <div class="form-group">
        <label>Policy YAML</label>
        <textarea id="policy-yaml" class="yaml-editor policy-create-yaml">version: 1
default: deny
rules:
  - id: allow_read
    effect: allow
    action: read</textarea>
      </div>
      <div class="policy-create-actions">
        <button id="btn-create-policy" class="btn btn-primary">Create Policy</button>
        <a href="/gui/policies" class="btn btn-secondary">Cancel</a>
      </div>
    </div>

    <script>window.__PAGE_DATA__ = ${JSON.stringify({
        ownerType: options.ownerType,
        ownerId: options.ownerId,
    })};</script>
    ${assetTags("pages/owner-policy-create/client.ts")}
  `;
    return renderPage("Create Policy", content, "/gui/policies", "owner", renderPageOptions);
}
