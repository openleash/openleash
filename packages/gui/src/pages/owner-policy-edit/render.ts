import { escapeHtml, renderPage, type RenderPageOptions } from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";
import { renderPolicyBuilderShell } from "../../shared/policy-builder-shell.js";

export interface OwnerPolicyEditOptions {
    policyId: string;
    name: string | null;
    description: string | null;
    policyYaml: string;
    /** Org id when editing an org-scoped policy; null for personal scope. */
    orgId: string | null;
}

export function renderOwnerPolicyEdit(
    options: OwnerPolicyEditOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const content = `
    <h2>Edit Policy</h2>
    <p class="policy-create-scope-hint text-muted">${escapeHtml(options.policyId)}</p>

    <div class="card policy-create-card">
      <div class="policy-create-fields">
        <div class="form-group policy-create-field-name">
          <label>Name</label>
          <input type="text" id="policy-name" class="form-input" value="${escapeHtml(options.name ?? "")}" placeholder="e.g. Read-only access">
        </div>
        <div class="form-group policy-create-field-desc">
          <label>Description</label>
          <input type="text" id="policy-desc" class="form-input" value="${escapeHtml(options.description ?? "")}" placeholder="What does this policy do?">
        </div>
      </div>
      ${renderPolicyBuilderShell(options.policyYaml)}
      <div class="policy-create-actions">
        <button id="btn-save-policy" class="btn btn-primary">Save Changes</button>
        <a href="/gui/policies" class="btn btn-secondary">Cancel</a>
      </div>
    </div>

    <script>window.__PAGE_DATA__ = ${JSON.stringify({
        policyId: options.policyId,
        orgId: options.orgId,
    })};</script>
    ${assetTags("pages/owner-policy-edit/client.ts")}
  `;
    return renderPage("Edit Policy", content, "/gui/policies", "owner", renderPageOptions);
}
