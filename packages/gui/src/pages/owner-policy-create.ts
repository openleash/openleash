import { renderPage } from "../layout.js";
import { assetTags } from "../manifest.js";

export function renderOwnerPolicyCreate(): string {
    const content = `
    <h2>Create Policy</h2>

    <div class="card" style="padding:20px;margin-top:20px">
      <div style="display:flex;gap:12px;margin-bottom:12px">
        <div class="form-group" style="flex:1">
          <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">Name</label>
          <input type="text" id="policyName" class="form-input" placeholder="e.g. Read-only access">
        </div>
        <div class="form-group" style="flex:2">
          <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">Description</label>
          <input type="text" id="policyDesc" class="form-input" placeholder="What does this policy do?">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">Agent Principal ID (optional)</label>
        <input type="text" id="agentId" class="form-input" placeholder="Leave empty for all agents" style="font-family:var(--font-mono)">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">Policy YAML</label>
        <textarea id="policyYaml" class="yaml-editor" style="min-height:200px">version: 1
default: deny
rules:
  - id: allow_read
    effect: allow
    action: read</textarea>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="createPolicy()">Create Policy</button>
        <a href="/gui/owner/policies" class="btn btn-secondary" style="text-decoration:none">Cancel</a>
      </div>
    </div>

    ${assetTags("pages/owner-policy-create.ts")}
  `;
    return renderPage("Create Policy", content, "/gui/owner/policies", "owner");
}
