import {
    renderPage,
    escapeHtml,
    idBadge,
    formatTimestamp,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerPolicyGroupListEntry {
    group_id: string;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    member_count: number;
}

export interface OwnerPolicyGroupsOptions {
    orgId: string;
    orgSlug: string;
    orgDisplayName: string;
    canManage: boolean;
}

export function renderOwnerPolicyGroups(
    groups: OwnerPolicyGroupListEntry[],
    options: OwnerPolicyGroupsOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const scopedPrefix = `/gui/orgs/${encodeURIComponent(options.orgSlug)}/policy-groups`;

    const rows =
        groups.length === 0
            ? '<tr><td colspan="4" class="opg-empty-row">No policy groups yet — create one to bind policies to a department or role.</td></tr>'
            : groups
                .map(
                    (g) => `
      <tr>
        <td><a href="${scopedPrefix}/${encodeURIComponent(g.slug)}" class="table-link">${escapeHtml(g.name)}</a>${idBadge(g.group_id)}</td>
        <td class="mono">${escapeHtml(g.slug)}</td>
        <td>${g.member_count}</td>
        <td>${formatTimestamp(g.created_at)}</td>
      </tr>`,
                )
                .join("");

    const createForm = options.canManage
        ? `
    <div id="create-group-panel" class="card opg-create-panel hidden">
      <div class="card-title">Create Policy Group</div>
      <div class="form-group">
        <label for="grp-name">Name</label>
        <input type="text" id="grp-name" class="form-input" placeholder="e.g. Customer Support">
        <div class="field-error" id="err-grp-name"></div>
      </div>
      <div class="form-group">
        <label for="grp-slug">Slug <span class="text-muted">(optional — auto-derived from name)</span></label>
        <input type="text" id="grp-slug" class="form-input" placeholder="customer-support">
        <div class="field-error" id="err-grp-slug"></div>
      </div>
      <div class="form-group">
        <label for="grp-description">Description</label>
        <input type="text" id="grp-description" class="form-input" placeholder="What this group is for">
      </div>
      <div class="toolbar">
        <button id="btn-grp-cancel" class="btn btn-secondary">Cancel</button>
        <button id="btn-grp-create" class="btn btn-primary">Create</button>
      </div>
    </div>`
        : "";

    const content = `
    <div class="agents-header">
      <h2>Policy Groups <span class="text-muted opg-org-label">${escapeHtml(options.orgDisplayName)}</span></h2>
      ${options.canManage ? '<button class="btn btn-primary" id="btn-show-create">+ New Group</button>' : ""}
    </div>

    <p class="opg-help">
      Policy groups are a middle tier between owner-wide policies and per-agent policies.
      Add agents to a group, then create a policy with <span class="mono">applies_to_group_id</span>
      set to the group — every member of the group will pick up the policy at authorize time.
    </p>

    ${createForm}

    <div class="card opg-list-card">
      <table>
        <colgroup><col><col style="width:200px"><col style="width:120px"><col style="width:180px"></colgroup>
        <thead>
          <tr><th>Name</th><th>Slug</th><th>Members</th><th>Created</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <script>window.__PAGE_DATA__ = ${JSON.stringify({
        orgId: options.orgId,
        orgSlug: options.orgSlug,
        canManage: options.canManage,
    })};</script>
    ${assetTags("pages/owner-policy-groups/client.ts")}
  `;

    return renderPage(
        "Policy Groups",
        content,
        `${scopedPrefix}`,
        "owner",
        renderPageOptions,
    );
}
