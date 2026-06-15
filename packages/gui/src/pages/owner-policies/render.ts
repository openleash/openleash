import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_POLICY_DRAFTS,
    INFO_POLICY_TIERS,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerPolicyEntry {
    policy_id: string;
    applies_to_agent_principal_id: string | null;
    applies_to_group_id?: string | null;
    rank?: number;
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
    group_names?: Map<string, string>;
    /** Set when rendering /gui/orgs/:slug/policies so the client targets org-scoped endpoints. */
    org_id?: string | null;
}

type Tier = "agent" | "group" | "owner_wide";

function tierOf(p: OwnerPolicyEntry): Tier {
    if (p.applies_to_agent_principal_id) return "agent";
    if (p.applies_to_group_id) return "group";
    return "owner_wide";
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
    const name = agentNames?.get(d.applies_to_agent_principal_id!) ?? null;
    const display = name ? escapeHtml(name) : copyableId(d.applies_to_agent_principal_id!);
    return `${display} <span class="badge badge-amber opol-badge-sm-ml" title="This agent is suggesting a policy for a DIFFERENT agent">other agent</span>`;
}

function suggestedByCell(d: OwnerPolicyDraftEntry, agentNames?: Map<string, string>): string {
    const name = agentNames?.get(d.agent_principal_id) ?? null;
    if (name) return escapeHtml(name);
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

function policyAppliesToCell(
    p: OwnerPolicyEntry,
    agentNames?: Map<string, string>,
    groupNames?: Map<string, string>,
): string {
    if (p.applies_to_agent_principal_id) {
        const name = agentNames?.get(p.applies_to_agent_principal_id) ?? null;
        return name ? escapeHtml(name) : copyableId(p.applies_to_agent_principal_id);
    }
    if (p.applies_to_group_id) {
        const name = groupNames?.get(p.applies_to_group_id) ?? null;
        const display = name
            ? `<span class="badge badge-blue opol-badge-sm" title="Policy bound to group ${escapeHtml(name)}">${escapeHtml(name)}</span>`
            : `<span class="badge badge-blue opol-badge-sm">Group ${copyableId(p.applies_to_group_id)}</span>`;
        return display;
    }
    return '<span class="badge badge-amber opol-badge-sm" title="This policy applies to ALL your agents">All agents</span>';
}

function renderPolicyRow(
    p: OwnerPolicyEntry,
    tier: Tier,
    disableActions: boolean,
    agentNames?: Map<string, string>,
    groupNames?: Map<string, string>,
): string {
    const displayName = p.name
        ? escapeHtml(p.name.length > 36 ? p.name.slice(0, 36) + "..." : p.name)
        : "";
    const appliesTo = policyAppliesToCell(p, agentNames, groupNames);
    const idAttr = escapeHtml(p.policy_id);

    return `
      <tr id="policy-row-${idAttr}" class="opol-policy-row" draggable="true" data-policy-id="${idAttr}" data-tier="${tier}">
        <td class="opol-drag-cell"><span class="material-symbols-outlined opol-drag-handle" aria-hidden="true">drag_indicator</span></td>
        <td>
          ${displayName ? `<div>${displayName}</div>` : ""}
          <div class="${displayName ? "opol-id-line" : "opol-id-line-no-gap"}">${copyableId(p.policy_id)}</div>
        </td>
        <td>${appliesTo}</td>
        <td>
          <a class="btn btn-secondary opol-btn-action" href="/gui/policies/${idAttr}/edit">Edit</a>
          <button class="btn btn-secondary opol-btn-action opol-btn-ml opol-btn-danger-outline" data-delete-policy="${idAttr}" ${disableActions ? "disabled" : ""}>Delete</button>
        </td>
      </tr>
    `;
}

function renderTierSection(
    label: string,
    description: string,
    tier: Tier,
    policies: OwnerPolicyEntry[],
    disableActions: boolean,
    agentNames?: Map<string, string>,
    groupNames?: Map<string, string>,
): string {
    const rowsHtml = policies.length === 0
        ? `<tr><td colspan="4" class="opol-empty-cell">No policies in this tier</td></tr>`
        : policies
              .map((p) => renderPolicyRow(p, tier, disableActions, agentNames, groupNames))
              .join("");

    return `
    <div class="opol-tier" data-tier="${tier}">
      <div class="opol-tier-header">
        <span class="opol-tier-label">${escapeHtml(label)}</span>
        <span class="opol-tier-desc">${escapeHtml(description)}</span>
      </div>
      <table class="opol-table-fixed">
        <colgroup><col style="width:32px"><col><col style="width:220px"><col style="width:180px"></colgroup>
        <tbody data-tier-body="${tier}">${rowsHtml}</tbody>
      </table>
    </div>`;
}

export function renderOwnerPolicies(
    policies: OwnerPolicyEntry[],
    drafts: OwnerPolicyDraftEntry[],
    options?: OwnerPoliciesOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const agentNames = options?.agent_names;
    const groupNames = options?.group_names;
    const disableActions = requireTotp && !totpEnabled;
    const pending = drafts.filter((d) => d.status === "PENDING");
    const resolved = drafts.filter((d) => d.status !== "PENDING");

    // Bucket by tier (server already sorted by rank within each tier).
    const agentTier: OwnerPolicyEntry[] = [];
    const groupTier: OwnerPolicyEntry[] = [];
    const ownerTier: OwnerPolicyEntry[] = [];
    for (const p of policies) {
        const t = tierOf(p);
        if (t === "agent") agentTier.push(p);
        else if (t === "group") groupTier.push(p);
        else ownerTier.push(p);
    }

    const activeSections = `
      ${renderTierSection("Agent-specific", "Evaluated first — bound to one specific agent.", "agent", agentTier, disableActions, agentNames, groupNames)}
      ${renderTierSection("Group", "Evaluated second — bound to a policy group. Drag to choose which group fires first.", "group", groupTier, disableActions, agentNames, groupNames)}
      ${renderTierSection("Owner-wide", "Evaluated last — apply to every agent you own. Drag to set baseline vs. override.", "owner_wide", ownerTier, disableActions, agentNames, groupNames)}
    `;

    // --- Pending Drafts section ---
    const totpBanner =
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error opol-totp-banner">Two-factor authentication is required to delete policies or approve/deny drafts. <a href="/gui/profile" class="opol-alert-link">Set up 2FA in your Profile.</a></div>'
            : "";

    const pendingRows =
        pending.length === 0
            ? '<tr><td colspan="7" class="opol-empty-cell">No pending policy drafts</td></tr>'
            : pending
                  .map((d) => {
                      const draftName = d.name
                          ? `<div class="opol-draft-name">${escapeHtml(d.name)}</div>`
                          : "";
                      return `
      <tr class="accordion-row">
        <td class="opol-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${draftName}<div class="${d.name ? "opol-id-line" : "opol-id-line-no-gap"}">${copyableId(d.policy_draft_id)}</div></td>
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
                      return `
      <tr class="accordion-row">
        <td class="opol-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${rName}<div class="${d.name ? "opol-id-line" : "opol-id-line-no-gap"}">${copyableId(d.policy_draft_id)}</div></td>
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
      <a href="/gui/policies/create" class="btn btn-primary opol-create-link"><span class="material-symbols-outlined opol-btn-icon">add</span>Create Policy</a>
    </div>

    <div class="card opol-card-flush">
      <h3 class="opol-card-heading">Active Policies${infoIcon("policy-tiers-info", INFO_POLICY_TIERS)}</h3>
      ${activeSections}
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

    <script>window.__PAGE_DATA__ = { totpEnabled: ${totpEnabled}, orgId: ${options?.org_id ? JSON.stringify(options.org_id) : "null"} };</script>
    ${assetTags("pages/owner-policies/client.ts")}
  `;
    return renderPage("My Policies", content, "/gui/policies", "owner", renderPageOptions);
}
