import { escapeHtml } from "./layout.js";

/**
 * Server-rendered scaffold for the visual policy builder.
 *
 * Emits a mode toggle (Visual / YAML), an empty visual panel that
 * `mountPolicyBuilder()` (client) populates, and a YAML textarea seeded with
 * `initialYaml`. The client module reads that textarea on mount to build the
 * form, so the textarea is the single source of the starting policy.
 *
 * Pair this with `mountPolicyBuilder()` from `shared/policy-builder.ts` in the
 * page's client script.
 */
export function renderPolicyBuilderShell(initialYaml: string): string {
    return `
    <div class="pb" id="policy-builder">
      <div class="pb-modes" role="tablist">
        <button type="button" class="pb-mode-btn pb-mode-active" data-pb-mode="visual">Visual builder</button>
        <button type="button" class="pb-mode-btn" data-pb-mode="yaml">YAML</button>
      </div>

      <div class="pb-panel" id="pb-visual">
        <div class="form-group">
          <label class="pb-section-label">When no rule matches…</label>
          <div class="pb-default-options" id="pb-default"></div>
        </div>
        <div class="form-group">
          <div class="pb-rules-head">
            <label class="pb-section-label">Rules</label>
            <button type="button" class="btn btn-secondary" id="pb-add-rule"><span class="material-symbols-outlined pb-btn-icon">add</span>Add rule</button>
          </div>
          <p class="form-help">Rules are checked top to bottom; the first one whose action matches decides. Anything unmatched falls through to the default above.</p>
          <div class="pb-rules" id="pb-rules"></div>
        </div>
      </div>

      <div class="pb-panel hidden" id="pb-yaml-panel">
        <label class="pb-section-label">Policy YAML</label>
        <textarea id="policy-yaml" class="yaml-editor pb-yaml">${escapeHtml(initialYaml)}</textarea>
        <p class="form-help">Edit raw YAML directly. Everything here is also editable in the visual builder — switching modes keeps the two in sync.</p>
      </div>
    </div>`;
}

/** Starting policy shown on the create page. */
export const DEFAULT_POLICY_YAML = `version: 1
default: deny
rules:
  - id: allow_read
    effect: allow
    action: read`;
