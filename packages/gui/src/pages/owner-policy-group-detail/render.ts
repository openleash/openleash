import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerPolicyGroupMember {
    agent_principal_id: string;
    agent_id: string;
    membership_id: string;
    added_at: string;
}

export interface OwnerPolicyGroupBoundPolicy {
    policy_id: string;
    name: string | null;
    description: string | null;
}

export interface OwnerPolicyGroupCandidateAgent {
    agent_principal_id: string;
    agent_id: string;
}

export interface OwnerPolicyGroupDetailData {
    group: {
        group_id: string;
        name: string;
        slug: string;
        description: string | null;
        created_at: string;
    };
    members: OwnerPolicyGroupMember[];
    boundPolicies: OwnerPolicyGroupBoundPolicy[];
    /** Agents in the org that are not yet members — pool for the "add" dropdown. */
    candidateAgents: OwnerPolicyGroupCandidateAgent[];
    orgId: string;
    orgSlug: string;
    canManage: boolean;
}

export function renderOwnerPolicyGroupDetail(
    data: OwnerPolicyGroupDetailData,
    renderPageOptions?: RenderPageOptions,
): string {
    const groupsPath = `/gui/orgs/${encodeURIComponent(data.orgSlug)}/policy-groups`;
    const policiesPath = `/gui/orgs/${encodeURIComponent(data.orgSlug)}/policies`;
    const agentsPath = `/gui/orgs/${encodeURIComponent(data.orgSlug)}/agents`;

    const memberRows =
        data.members.length === 0
            ? '<p class="opg-empty-row">No members yet.</p>'
            : `<table>
          <colgroup><col><col style="width:200px"><col style="width:180px"></colgroup>
          <thead><tr><th>Agent</th><th>Added</th><th>Actions</th></tr></thead>
          <tbody>${data.members
              .map(
                  (m) => `
            <tr data-agent-principal-id="${escapeHtml(m.agent_principal_id)}" data-membership-id="${escapeHtml(m.membership_id)}">
              <td><a href="${agentsPath}/${escapeHtml(m.agent_principal_id)}" class="table-link">${escapeHtml(m.agent_id)}</a></td>
              <td>${formatTimestamp(m.added_at)}</td>
              <td>${
                  data.canManage
                      ? `<button class="btn btn-secondary btn-sm" data-remove-member="${escapeHtml(m.agent_principal_id)}">Remove</button>`
                      : '<span class="text-muted">-</span>'
              }</td>
            </tr>`,
              )
              .join("")}</tbody>
        </table>`;

    const policyRows =
        data.boundPolicies.length === 0
            ? '<p class="opg-empty-row">No policies bound to this group yet.</p>'
            : `<table>
          <colgroup><col><col></colgroup>
          <thead><tr><th>Policy</th><th>Description</th></tr></thead>
          <tbody>${data.boundPolicies
              .map(
                  (p) => `
            <tr>
              <td><a href="${policiesPath}/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.name ?? p.policy_id)}</a></td>
              <td>${escapeHtml(p.description ?? "")}</td>
            </tr>`,
              )
              .join("")}</tbody>
        </table>`;

    const addMemberControl =
        data.canManage && data.candidateAgents.length > 0
            ? `
      <div class="form-group opg-add-member-control">
        <label for="opg-add-agent">Add agent to group</label>
        <div class="opg-add-row">
          <select id="opg-add-agent" class="form-select">
            <option value="">Select an agent...</option>
            ${data.candidateAgents
                .map(
                    (a) =>
                        `<option value="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_id)}</option>`,
                )
                .join("")}
          </select>
          <button id="opg-add-btn" class="btn btn-primary">Add</button>
        </div>
      </div>`
            : data.canManage
                ? '<p class="text-muted">All org agents are already in this group.</p>'
                : "";

    const content = `
    <div class="page-header">
      <div class="opg-detail-heading">
        <h2><span class="material-symbols-outlined">group_work</span> ${escapeHtml(data.group.name)}</h2>
        <span class="badge badge-muted">${escapeHtml(data.group.slug)}</span>
      </div>
      ${data.group.description ? `<p>${escapeHtml(data.group.description)}</p>` : ""}
      <p>${copyableId(data.group.group_id, data.group.group_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Details</div>
      <table>
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          <tr><td class="opg-detail-label">Name</td><td>${escapeHtml(data.group.name)}</td></tr>
          <tr><td class="opg-detail-label">Slug</td><td class="mono">${escapeHtml(data.group.slug)}</td></tr>
          <tr><td class="opg-detail-label">Description</td><td>${data.group.description ? escapeHtml(data.group.description) : '<span class="text-muted">None</span>'}</td></tr>
          <tr><td class="opg-detail-label">Created</td><td class="mono">${formatTimestamp(data.group.created_at)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Members (${data.members.length})</div>
      ${addMemberControl}
      ${memberRows}
    </div>

    <div class="card">
      <div class="card-title">Bound policies (${data.boundPolicies.length})</div>
      ${policyRows}
      ${data.canManage && data.boundPolicies.length === 0
          ? `<a href="${policiesPath}/create?applies_to_group_id=${encodeURIComponent(data.group.group_id)}" class="btn btn-primary btn-sm">+ Add policy for this group</a>`
          : ""}
    </div>

    <div class="toolbar">
      <a href="${groupsPath}" class="btn btn-secondary">Back to Groups</a>
      ${data.canManage && data.boundPolicies.length === 0 ? '<button id="btn-delete-group" class="btn btn-danger">Delete group</button>' : ""}
    </div>

    <script>window.__PAGE_DATA__ = ${JSON.stringify({
        orgId: data.orgId,
        orgSlug: data.orgSlug,
        groupId: data.group.group_id,
        groupSlug: data.group.slug,
        canManage: data.canManage,
    })};</script>
    ${assetTags("pages/owner-policy-group-detail/client.ts")}
  `;

    return renderPage(
        data.group.name,
        content,
        groupsPath,
        "owner",
        renderPageOptions,
    );
}
