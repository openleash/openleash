import {
    renderPage,
    escapeHtml,
    idBadge,
    formatTimestamp,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerProvisionerListEntry {
    provisioner_id: string;
    name: string;
    status: "ACTIVE" | "REVOKED";
    created_at: string;
    revoked_at: string | null;
    last_used_at: string | null;
    enrolled_agent_count: number;
}

export function renderOwnerProvisioners(
    provisioners: OwnerProvisionerListEntry[],
    renderPageOptions?: RenderPageOptions,
): string {
    const rows =
        provisioners.length === 0
            ? '<tr><td colspan="5" class="oprov-empty-row">No provisioners yet — create one to let an agent platform enroll agents for you.</td></tr>'
            : provisioners
                .map(
                    (p) => `
      <tr>
        <td>${escapeHtml(p.name)}${idBadge(p.provisioner_id)}</td>
        <td><span class="badge ${p.status === "ACTIVE" ? "badge-green" : "badge-red"}">${p.status}</span></td>
        <td>${p.enrolled_agent_count}</td>
        <td>${p.last_used_at ? formatTimestamp(p.last_used_at) : '<span class="text-muted">never</span>'}</td>
        <td>${
            p.status === "ACTIVE"
                ? `<button class="btn btn-danger btn-sm oprov-revoke" data-id="${p.provisioner_id}" data-name="${escapeHtml(p.name)}">Revoke</button>`
                : formatTimestamp(p.revoked_at ?? "")
        }</td>
      </tr>`,
                )
                .join("");

    const content = `
    <div class="agents-header">
      <h2>Provisioners</h2>
      <button class="btn btn-primary" id="btn-show-create">+ New Provisioner</button>
    </div>

    <p class="oprov-help">
      A provisioner is a token for software that deploys agents on your behalf —
      an agent launchpad or a CI pipeline. It can enroll new agents (optionally
      binding one of your policies at enrollment) and list what it enrolled.
      It cannot read your data, change policies, or act as you.
    </p>

    <div id="create-panel" class="card oprov-create-panel hidden">
      <div class="card-title">Create Provisioner</div>
      <div class="form-group">
        <label for="prov-name">Name</label>
        <input type="text" id="prov-name" class="form-input" placeholder="e.g. claw-controller-office">
        <div class="field-error" id="err-prov-name"></div>
      </div>
      <div class="toolbar">
        <button id="btn-create-cancel" class="btn btn-secondary">Cancel</button>
        <button id="btn-create" class="btn btn-primary">Create</button>
      </div>
    </div>

    <div id="token-panel" class="card oprov-token-panel hidden">
      <div class="card-title">Provisioner token — shown only once</div>
      <p class="oprov-token-help">
        Copy this token into the connecting platform now. For security it is
        not stored and cannot be shown again — if it is lost, revoke the
        provisioner and create a new one.
      </p>
      <div class="oprov-token-row">
        <code id="token-value" class="mono oprov-token-value"></code>
        <button class="btn btn-secondary btn-sm" id="btn-copy-token">Copy</button>
      </div>
    </div>

    <div class="card oprov-list-card">
      <table>
        <colgroup><col><col style="width:120px"><col style="width:150px"><col style="width:180px"><col style="width:160px"></colgroup>
        <thead>
          <tr><th>Name</th><th>Status</th><th>Enrolled agents</th><th>Last used</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${assetTags("pages/owner-provisioners/client.ts")}
  `;

    return renderPage(
        "Provisioners",
        content,
        "/gui/personal/provisioners",
        "owner",
        renderPageOptions,
    );
}
