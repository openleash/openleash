import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_POLICY_DRAFTS,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerPolicyEntry {
    policy_id: string;
    applies_to_agent_principal_id: string | null;
    name: string | null;
    description: string | null;
    policy_yaml?: string;
}

export interface OwnerPolicyDraftEntry {
    policy_draft_id: string;
    agent_id: string;
    agent_principal_id: string;
    applies_to_agent_principal_id: string | null;
    name: string | null;
    description: string | null;
    policy_yaml: string;
    justification: string | null;
    status: string;
    resulting_policy_id: string | null;
    denial_reason: string | null;
    created_at: string;
    resolved_at: string | null;
}

export interface OwnerPoliciesOptions {
    totp_enabled?: boolean;
    require_totp?: boolean;
    agent_names?: Map<string, string>;
}

function appliesToCell(d: OwnerPolicyDraftEntry, agentNames?: Map<string, string>): string {
    const isSelf = d.applies_to_agent_principal_id === d.agent_principal_id;
    const isAll = !d.applies_to_agent_principal_id;

    if (isAll) {
        return `<span class="badge badge-amber opol-badge-sm" title="This policy will apply to ALL your agents, not just the one suggesting it">All agents</span>`;
    }
    if (isSelf) {
        const name = agentNames?.get(d.applies_to_agent_principal_id!) ?? null;
        const display = name
            ? `${escapeHtml(name)} (self)`
            : `${copyableId(d.applies_to_agent_principal_id!)} <span class="opol-self-label">(self)</span>`;
        return display;
    }
    // Other agent
    const name = agentNames?.get(d.applies_to_agent_principal_id!) ?? null;
    const display = name ? escapeHtml(name) : copyableId(d.applies_to_agent_principal_id!);
    return `${display} <span class="badge badge-amber opol-badge-sm-ml" title="This agent is suggesting a policy for a DIFFERENT agent">other agent</span>`;
}

function suggestedByCell(d: OwnerPolicyDraftEntry, agentNames?: Map<string, string>): string {
    const name = agentNames?.get(d.agent_principal_id) ?? null;
    if (name) {
        return escapeHtml(name);
    }
    return copyableId(d.agent_id, d.agent_id.length);
}

function scopeWarning(d: OwnerPolicyDraftEntry): string {
    const isSelf = d.applies_to_agent_principal_id === d.agent_principal_id;
    const isAll = !d.applies_to_agent_principal_id;

    if (isAll) {
        return `<div class="alert opol-scope-warning">
      <strong>Broad scope:</strong> Agent <span class="mono">${escapeHtml(d.agent_id)}</span> is proposing a policy that applies to <strong>all your agents</strong>, not just itself. Review carefully.
    </div>`;
    }
    if (!isSelf) {
        return `<div class="alert opol-scope-warning">
      <strong>Cross-agent:</strong> Agent <span class="mono">${escapeHtml(d.agent_id)}</span> is proposing a policy for a <strong>different agent</strong> (${copyableId(d.applies_to_agent_principal_id!)}). Review carefully.
    </div>`;
    }
    return "";
}

export function renderOwnerPolicies(
    policies: OwnerPolicyEntry[],
    drafts: OwnerPolicyDraftEntry[],
    options?: OwnerPoliciesOptions,
): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const agentNames = options?.agent_names;
    const disableActions = requireTotp && !totpEnabled;
    const pending = drafts.filter((d) => d.status === "PENDING");
    const resolved = drafts.filter((d) => d.status !== "PENDING");

    // --- Active Policies section ---
    const policyRows =
        policies.length === 0
            ? '<tr><td colspan="3" class="opol-empty-cell">No policies</td></tr>'
            : policies
                  .map((p) => {
                      let appliesTo: string;
                      if (!p.applies_to_agent_principal_id) {
                          appliesTo =
                              '<span class="badge badge-amber opol-badge-sm" title="This policy applies to ALL your agents">All agents</span>';
                      } else {
                          const name = agentNames?.get(p.applies_to_agent_principal_id) ?? null;
                          appliesTo = name
                              ? escapeHtml(name)
                              : copyableId(p.applies_to_agent_principal_id);
                      }
                      const displayName = p.name
                          ? escapeHtml(p.name.length > 36 ? p.name.slice(0, 36) + "..." : p.name)
                          : "";
                      const descLine = p.description
                          ? `<div class="opol-desc-line">${escapeHtml(p.description)}</div>`
                          : "";
                      return `
      <tr id="policy-row-${escapeHtml(p.policy_id)}">
        <td>
          ${displayName ? `<div>${displayName}</div>` : ""}
          ${descLine}
          <div class="${displayName ? "opol-id-line" : "opol-id-line-no-gap"}">${copyableId(p.policy_id)}</div>
        </td>
        <td>${appliesTo}</td>
        <td>
          <button class="btn btn-secondary opol-btn-action" data-toggle-editor="${escapeHtml(p.policy_id)}">Edit</button>
          <button class="btn btn-secondary opol-btn-action opol-btn-ml opol-btn-danger-outline" data-delete-policy="${escapeHtml(p.policy_id)}" ${disableActions ? "disabled" : ""}>Delete</button>
        </td>
      </tr>
      <tr id="editor-row-${escapeHtml(p.policy_id)}" class="hidden">
        <td colspan="3" class="opol-editor-cell">
          <div class="opol-editor-fields">
            <div class="opol-editor-field-sm">
              <label class="opol-editor-label">Name</label>
              <input type="text" id="editor-name-${escapeHtml(p.policy_id)}" class="form-input" value="${escapeHtml(p.name ?? "")}" placeholder="e.g. Read-only access">
            </div>
            <div class="opol-editor-field-lg">
              <label class="opol-editor-label">Description</label>
              <input type="text" id="editor-desc-${escapeHtml(p.policy_id)}" class="form-input" value="${escapeHtml(p.description ?? "")}" placeholder="What does this policy do?">
            </div>
          </div>
          <textarea id="editor-yaml-${escapeHtml(p.policy_id)}" class="yaml-editor opol-yaml-inline">${escapeHtml(p.policy_yaml ?? "")}</textarea>
          <div class="opol-editor-actions">
            <button class="btn btn-primary opol-btn-action" data-save-policy="${escapeHtml(p.policy_id)}">Save</button>
            <button class="btn btn-secondary opol-btn-action" data-toggle-editor="${escapeHtml(p.policy_id)}">Cancel</button>
          </div>
        </td>
      </tr>
    `;
                  })
                  .join("");

    // --- Pending Drafts section ---
    const totpBanner =
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error opol-totp-banner">Two-factor authentication is required to delete policies or approve/deny drafts. <a href="/gui/owner/profile" class="opol-alert-link">Set up 2FA in your Profile.</a></div>'
            : "";

    const pendingRows =
        pending.length === 0
            ? '<tr><td colspan="7" class="opol-empty-cell">No pending policy drafts</td></tr>'
            : pending
                  .map((d) => {
                      const draftName = d.name
                          ? `<div class="opol-draft-name">${escapeHtml(d.name)}</div>`
                          : "";
                      const draftDesc = d.description
                          ? `<div class="opol-draft-desc">${escapeHtml(d.description)}</div>`
                          : "";
                      return `
      <tr class="accordion-row">
        <td class="opol-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${draftName}${draftDesc}<div class="${d.name ? "opol-id-line" : "opol-id-line-no-gap"}">${copyableId(d.policy_draft_id)}</div></td>
        <td>${suggestedByCell(d, agentNames)}</td>
        <td>${appliesToCell(d, agentNames)}</td>
        <td${d.justification ? ` title="${escapeHtml(d.justification)}"` : ""}>${d.justification ? escapeHtml(d.justification) : '<span class="opol-dash">-</span>'}</td>
        <td>${formatTimestamp(d.created_at)}</td>
        <td>
          <button class="btn btn-primary opol-btn-action" data-handle-draft="${d.policy_draft_id}" data-draft-action="approve" ${disableActions ? "disabled" : ""}>Approve</button>
          <button class="btn btn-secondary opol-btn-action opol-btn-ml opol-btn-danger-outline" data-handle-draft="${d.policy_draft_id}" data-draft-action="deny" ${disableActions ? "disabled" : ""}>Deny</button>
        </td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(d.policy_draft_id)}">
        <td colspan="7" class="opol-detail-cell">
          ${scopeWarning(d)}
          <div class="opol-yaml-label">Proposed Policy YAML</div>
          <div class="accordion-content">${escapeHtml(d.policy_yaml)}</div>
        </td>
      </tr>
    `;
                  })
                  .join("");

    // --- Resolved Drafts section ---
    const resolvedRows =
        resolved.length === 0
            ? ""
            : resolved
                  .map((d) => {
                      const badge =
                          d.status === "APPROVED"
                              ? "badge-green"
                              : d.status === "DENIED"
                                ? "badge-red"
                                : "badge-muted";
                      const rName = d.name
                          ? `<div class="opol-draft-name">${escapeHtml(d.name)}</div>`
                          : "";
                      const rDesc = d.description
                          ? `<div class="opol-draft-desc">${escapeHtml(d.description)}</div>`
                          : "";
                      return `
      <tr class="accordion-row">
        <td class="opol-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${rName}${rDesc}<div class="${d.name ? "opol-id-line" : "opol-id-line-no-gap"}">${copyableId(d.policy_draft_id)}</div></td>
        <td>${suggestedByCell(d, agentNames)}</td>
        <td>${appliesToCell(d, agentNames)}</td>
        <td><span class="badge ${badge}">${escapeHtml(d.status)}</span></td>
        <td>${
            d.resulting_policy_id
                ? `<a href="#policy-row-${escapeHtml(d.resulting_policy_id)}" class="opol-result-link" title="Scroll to active policy">${copyableId(d.resulting_policy_id)}</a>`
                : d.denial_reason
                  ? escapeHtml(d.denial_reason)
                  : '<span class="opol-dash">-</span>'
        }</td>
        <td>${formatTimestamp(d.created_at)}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(d.policy_draft_id)}">
        <td colspan="7" class="opol-detail-cell">
          ${scopeWarning(d)}
          <div class="opol-yaml-label">Proposed Policy YAML</div>
          <div class="accordion-content">${escapeHtml(d.policy_yaml)}</div>
        </td>
      </tr>`;
                  })
                  .join("");

    const content = `
    <div class="page-header flex-between">
      <h2>My Policies</h2>
      <a href="/gui/owner/policies/create" class="btn btn-primary opol-create-link"><span class="material-symbols-outlined opol-btn-icon">add</span>Create Policy</a>
    </div>

    <div class="card opol-card-flush">
      <h3 class="opol-card-heading">Active Policies</h3>
      <table class="opol-table-fixed">
        <colgroup><col><col style="width:220px"><col style="width:180px"></colgroup>
        <thead>
          <tr><th>Policy</th><th>Applies To</th><th>Actions</th></tr>
        </thead>
        <tbody>${policyRows}</tbody>
      </table>
    </div>

    <div class="card opol-card-flush">
      <h3 class="opol-card-heading">Pending Drafts${infoIcon("policy-drafts-info", INFO_POLICY_DRAFTS)}</h3>
      <p class="opol-section-desc">
        Your agents can propose new policies. Review and approve or deny them here.
      </p>
      ${totpBanner}
      <table>
        <colgroup><col style="width:20px"><col style="width:290px"><col><col><col><col style="width:170px"><col style="width:180px"></colgroup>
        <thead>
          <tr><th></th><th>ID</th><th>Suggested By</th><th>Applies To</th><th>Justification</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>

    ${
        resolved.length > 0
            ? `
    <div class="card opol-card-flush">
      <h3 class="opol-card-heading">Resolved Drafts</h3>
      <table>
        <colgroup><col style="width:20px"><col style="width:290px"><col><col><col style="width:130px"><col style="width:290px"><col style="width:170px"></colgroup>
        <thead>
          <tr><th></th><th>ID</th><th>Suggested By</th><th>Applies To</th><th>Status</th><th>Result</th><th>Created</th></tr>
        </thead>
        <tbody>${resolvedRows}</tbody>
      </table>
    </div>`
            : ""
    }

    <script>window.__PAGE_DATA__ = { totpEnabled: ${totpEnabled} };</script>
    ${assetTags("pages/owner-policies/client.ts")}
  `;
    return renderPage("My Policies", content, "/gui/owner/policies", "owner");
}
