import {
    renderPage,
    escapeHtml,
    copyableId,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerTransformationEntry {
    transformation_id: string;
    applies_to_agent_principal_id: string | null;
    name: string | null;
    description: string | null;
    enabled: boolean;
    rank: number;
    rule:
        | { type: "cap_output_length"; max_characters?: number | null; max_lines?: number | null }
        | { type: "regex_replace"; from_pattern: string; to_pattern: string };
}

export interface OwnerTransformationsOptions {
    /** Set when rendered under an org scope; org transformations are not supported in this PoC. */
    org_id?: string | null;
    agent_names?: Map<string, string>;
}

function ruleConfigEditor(t: OwnerTransformationEntry): string {
    if (t.rule.type === "cap_output_length") {
        const chars = t.rule.max_characters ?? "";
        const lines = t.rule.max_lines ?? "";
        return `
        <div class="otr-fields" data-rule-type="cap_output_length">
          <label class="otr-field">max_characters
            <input type="number" min="1" class="otr-input" data-field="max_characters" value="${escapeHtml(String(chars))}" placeholder="(unset)">
          </label>
          <label class="otr-field">max_lines
            <input type="number" min="1" class="otr-input" data-field="max_lines" value="${escapeHtml(String(lines))}" placeholder="(unset)">
          </label>
        </div>`;
    }
    return `
      <div class="otr-fields" data-rule-type="regex_replace">
        <label class="otr-field otr-field-wide">from_pattern
          <input type="text" class="otr-input otr-mono" data-field="from_pattern" value="${escapeHtml(t.rule.from_pattern)}">
        </label>
        <label class="otr-field otr-field-wide">to_pattern
          <input type="text" class="otr-input otr-mono" data-field="to_pattern" value="${escapeHtml(t.rule.to_pattern)}">
        </label>
      </div>`;
}

function transformationRow(t: OwnerTransformationEntry): string {
    const id = escapeHtml(t.transformation_id);
    const displayName = t.name ? escapeHtml(t.name) : "";
    const typeBadge = t.rule.type === "cap_output_length"
        ? `<span class="badge badge-blue">cap_output_length</span>`
        : `<span class="badge badge-amber">regex_replace</span>`;
    return `
    <tr class="otr-row" data-transformation-id="${id}" data-type="${escapeHtml(t.rule.type)}">
      <td>
        ${typeBadge}
        ${displayName ? `<div class="otr-name">${displayName}</div>` : ""}
        <div class="otr-id-line">${copyableId(t.transformation_id)}</div>
      </td>
      <td>${ruleConfigEditor(t)}</td>
      <td>${t.applies_to_agent_principal_id ? copyableId(t.applies_to_agent_principal_id) : '<span class="badge badge-amber">All agents</span>'}</td>
      <td class="otr-center">
        <input type="checkbox" class="otr-enabled" data-transformation-id="${id}" ${t.enabled ? "checked" : ""} aria-label="Enabled">
      </td>
      <td>
        <button class="btn btn-primary otr-btn-action" data-save-transformation="${id}">Save</button>
        <button class="btn btn-secondary otr-btn-action otr-btn-ml otr-btn-danger-outline" data-delete-transformation="${id}">Delete</button>
      </td>
    </tr>`;
}

export function renderOwnerTransformations(
    transformations: OwnerTransformationEntry[],
    options?: OwnerTransformationsOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const sorted = [...transformations].sort((a, b) => a.rank - b.rank);
    const rowsHtml = sorted.length === 0
        ? `<tr><td colspan="5" class="otr-empty-cell">No transformations configured yet</td></tr>`
        : sorted.map(transformationRow).join("");

    const content = `
    <div class="page-header flex-between">
      <h2>Output Transformations</h2>
    </div>

    <div class="card otr-intro">
      <p class="otr-section-desc">
        Transformations are applied <strong>client-side by a post-tool-call hook</strong> to a tool's
        <strong>output</strong> before it returns to the agent. They are fetched from
        <code>GET /v1/agent/transformations</code> on each invocation, so edits here take effect on the next tool call.
      </p>
    </div>

    <div class="card otr-card">
      <h3 class="otr-card-heading">Active Transformations</h3>
      <table class="otr-table">
        <colgroup><col style="width:240px"><col><col style="width:160px"><col style="width:90px"><col style="width:170px"></colgroup>
        <thead>
          <tr><th>Type / Name</th><th>Configuration</th><th>Applies To</th><th>Enabled</th><th>Actions</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div class="card otr-card">
      <h3 class="otr-card-heading">Create Transformation</h3>
      <div class="otr-create">
        <label class="otr-field">Type
          <select id="otr-new-type" class="otr-input">
            <option value="cap_output_length">cap_output_length</option>
            <option value="regex_replace">regex_replace</option>
          </select>
        </label>
        <label class="otr-field">Name (optional)
          <input type="text" id="otr-new-name" class="otr-input" placeholder="e.g. Cap long DB dumps">
        </label>
        <div id="otr-new-fields-cap" class="otr-fields">
          <label class="otr-field">max_characters
            <input type="number" min="1" id="otr-new-max-characters" class="otr-input" placeholder="20000">
          </label>
          <label class="otr-field">max_lines
            <input type="number" min="1" id="otr-new-max-lines" class="otr-input" placeholder="(unset)">
          </label>
        </div>
        <div id="otr-new-fields-regex" class="otr-fields otr-hidden">
          <label class="otr-field otr-field-wide">from_pattern
            <input type="text" id="otr-new-from" class="otr-input otr-mono" placeholder="regex">
          </label>
          <label class="otr-field otr-field-wide">to_pattern
            <input type="text" id="otr-new-to" class="otr-input otr-mono" placeholder="[REDACTED]">
          </label>
        </div>
        <button id="otr-create-btn" class="btn btn-primary">Create</button>
      </div>
    </div>

    <script>window.__PAGE_DATA__ = { orgId: ${options?.org_id ? JSON.stringify(options.org_id) : "null"} };</script>
    ${assetTags("pages/owner-transformations/client.ts")}
  `;
    return renderPage("Transformations", content, "/gui/transformations", "owner", renderPageOptions);
}
