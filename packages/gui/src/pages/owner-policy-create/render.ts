import { renderPage, type RenderPageOptions } from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export function renderOwnerPolicyCreate(renderPageOptions?: RenderPageOptions): string {
    const content = `
    <h2>Create Policy</h2>

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
      <div class="form-group">
        <label>Agent Principal ID (optional)</label>
        <input type="text" id="agent-id" class="form-input policy-create-agent-input" placeholder="Leave empty for all agents">
      </div>
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
        <a href="/gui/owner/policies" class="btn btn-secondary">Cancel</a>
      </div>
    </div>

    ${assetTags("pages/owner-policy-create/client.ts")}
  `;
    return renderPage("Create Policy", content, "/gui/owner/policies", "owner", renderPageOptions);
}
