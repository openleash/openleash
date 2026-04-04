import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_APPROVAL_REQUESTS,
    type RenderPageOptions,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerApprovalEntry {
    approval_request_id: string;
    agent_id: string;
    agent_principal_id: string;
    action_type: string;
    action_hash: string | null;
    decision_id: string | null;
    action: Record<string, unknown> | null;
    context: Record<string, unknown> | null;
    justification: string | null;
    status: string;
    denial_reason: string | null;
    created_at: string;
    expires_at: string;
    resolved_at: string | null;
}

export interface ApprovalPage {
    items: OwnerApprovalEntry[];
    total: number;
    page: number;
    pageSize: number;
}

export interface OwnerApprovalsData {
    pending: ApprovalPage;
    resolved: ApprovalPage;
}

export interface OwnerApprovalsOptions {
    totp_enabled?: boolean;
    require_totp?: boolean;
    agent_names?: Map<string, string>;
}

function detailRow(label: string, value: string): string {
    return `<tr>
    <td class="approvals-detail-label">${label}</td>
    <td class="approvals-detail-value">${value}</td>
  </tr>`;
}

function renderDetailPanel(a: OwnerApprovalEntry, agentNames?: Map<string, string>): string {
    const agentName = agentNames?.get(a.agent_principal_id) ?? null;
    const agentDisplay = agentName
        ? `${escapeHtml(agentName)} (${copyableId(a.agent_principal_id)})`
        : copyableId(a.agent_principal_id);

    let rows = "";
    rows += detailRow("Agent", `${escapeHtml(a.agent_id)} &mdash; ${agentDisplay}`);
    rows += detailRow(
        "Action Type",
        `<span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith("communication.") ? ' <span class="badge badge-muted approvals-badge-glove">MCP Glove</span>' : ""}`,
    );
    if (a.justification) {
        rows += detailRow("Justification", escapeHtml(a.justification));
    }
    if (a.decision_id) {
        rows += detailRow(
            "Decision ID",
            `<span class="mono approvals-mono-sm">${escapeHtml(a.decision_id)}</span>`,
        );
    }
    if (a.action_hash) {
        rows += detailRow(
            "Action Hash",
            `<span class="mono approvals-mono-sm">${escapeHtml(a.action_hash)}</span>`,
        );
    }
    rows += detailRow("Created", formatTimestamp(a.created_at));
    rows += detailRow("Expires", formatTimestamp(a.expires_at));
    if (a.resolved_at) {
        rows += detailRow("Resolved", formatTimestamp(a.resolved_at));
    }
    if (a.denial_reason) {
        rows += detailRow("Denial Reason", escapeHtml(a.denial_reason));
    }

    const actionJson = a.action ? JSON.stringify(a.action, null, 2) : null;
    const contextJson = a.context ? JSON.stringify(a.context, null, 2) : null;

    return `
    <table class="approvals-detail-table"><colgroup><col style="width:120px"><col></colgroup><tbody>${rows}</tbody></table>
    ${
        actionJson
            ? `
      <div class="approvals-section-heading">Action Payload</div>
      <div class="accordion-content">${escapeHtml(actionJson)}</div>
    `
            : ""
    }
    ${
        contextJson
            ? `
      <div class="approvals-section-heading">Context</div>
      <div class="accordion-content">${escapeHtml(contextJson)}</div>
    `
            : ""
    }
  `;
}

function renderPagination(
    pageData: ApprovalPage,
    paramPrefix: string,
    otherParams: string,
): string {
    const { total, page, pageSize } = pageData;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const pageStart = total === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + pageSize, total);
    const basePath = "/gui/approvals";

    const prevDisabled = page <= 1 ? " disabled" : "";
    const nextDisabled = page >= totalPages ? " disabled" : "";
    const link = (p: number) => `${basePath}?${paramPrefix}_page=${p}&${paramPrefix}_page_size=${pageSize}${otherParams}`;
    const prevHref = page > 1 ? link(page - 1) : "#";
    const nextHref = page < totalPages ? link(page + 1) : "#";

    const pageSizeOptions = [10, 25, 50]
        .map((s) => `<option value="${s}"${s === pageSize ? " selected" : ""}>${s}</option>`)
        .join("");

    return `
      <div class="table-pagination">
        <div class="table-pagination-info">
          Showing ${pageStart}–${pageEnd} of ${total}
        </div>
        <div class="table-pagination-controls">
          <div class="table-pagination-size">
            <label>Rows</label>
            <select id="${paramPrefix}-page-size" class="form-select">${pageSizeOptions}</select>
          </div>
          <div class="table-pagination-nav">
            <a href="${link(1)}" class="btn btn-secondary btn-sm btn-icon${prevDisabled}" title="First page"><span class="material-symbols-outlined">first_page</span></a>
            <a href="${prevHref}" class="btn btn-secondary btn-sm btn-icon${prevDisabled}" title="Previous page"><span class="material-symbols-outlined">chevron_left</span></a>
            <span class="table-pagination-pages">Page ${page} of ${totalPages}</span>
            <a href="${nextHref}" class="btn btn-secondary btn-sm btn-icon${nextDisabled}" title="Next page"><span class="material-symbols-outlined">chevron_right</span></a>
            <a href="${link(totalPages)}" class="btn btn-secondary btn-sm btn-icon${nextDisabled}" title="Last page"><span class="material-symbols-outlined">last_page</span></a>
          </div>
        </div>
      </div>`;
}

export function renderOwnerApprovals(
    data: OwnerApprovalsData,
    options?: OwnerApprovalsOptions,
    renderPageOptions?: RenderPageOptions,
): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const agentNames = options?.agent_names;
    const disableActions = requireTotp && !totpEnabled;
    const { pending, resolved } = data;

    // Build other-table params so page size changes preserve the other table's state
    const resolvedParams = `&resolved_page=${resolved.page}&resolved_page_size=${resolved.pageSize}`;
    const pendingParams = `&pending_page=${pending.page}&pending_page_size=${pending.pageSize}`;

    const pendingRows =
        pending.items.length === 0
            ? '<tr><td colspan="6" class="approvals-empty-row">No pending approvals</td></tr>'
            : pending.items
                  .map((a) => {
                      const agentName = agentNames?.get(a.agent_principal_id) ?? null;
                      const agentDisplay = agentName
                          ? escapeHtml(agentName)
                          : escapeHtml(a.agent_id);
                      return `
      <tr class="accordion-row">
        <td class="approvals-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${agentDisplay}</td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith("communication.") ? ' <span class="badge badge-muted approvals-badge-glove">MCP Glove</span>' : ""}</td>
        <td>${formatTimestamp(a.created_at)}</td>
        <td>${formatTimestamp(a.expires_at)}</td>
        <td>
          <button class="btn btn-primary approvals-btn-approve" data-handle-approval="${a.approval_request_id}" data-approval-action="approve" ${disableActions ? "disabled" : ""}>Approve</button>
          <button class="btn btn-secondary approvals-btn-deny" data-handle-approval="${a.approval_request_id}" data-approval-action="deny" ${disableActions ? "disabled" : ""}>Deny</button>
        </td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(a.approval_request_id)}">
        <td colspan="6" class="approvals-accordion-body">
          ${renderDetailPanel(a, agentNames)}
        </td>
      </tr>`;
                  })
                  .join("");

    const resolvedRows =
        resolved.items.length === 0
            ? ""
            : resolved.items
                  .map((a) => {
                      const badge =
                          a.status === "APPROVED"
                              ? "badge-green"
                              : a.status === "DENIED"
                                ? "badge-red"
                                : a.status === "EXPIRED"
                                  ? "badge-muted"
                                  : "badge-muted";
                      const agentName = agentNames?.get(a.agent_principal_id) ?? null;
                      const agentDisplay = agentName
                          ? escapeHtml(agentName)
                          : escapeHtml(a.agent_id);
                      return `
      <tr class="accordion-row">
        <td class="approvals-chevron-cell"><span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${agentDisplay}</td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith("communication.") ? ' <span class="badge badge-muted approvals-badge-glove">MCP Glove</span>' : ""}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${formatTimestamp(a.created_at)}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(a.approval_request_id)}">
        <td colspan="5" class="approvals-accordion-body">
          ${renderDetailPanel(a, agentNames)}
        </td>
      </tr>`;
                  })
                  .join("");

    const totpBanner =
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error approvals-totp-banner">Two-factor authentication is required. <a href="/gui/profile" class="approvals-totp-link">Set up 2FA in your Profile.</a></div>'
            : "";

    const pendingPagination = pending.total > 0 ? renderPagination(pending, "pending", resolvedParams) : "";
    const resolvedPagination = resolved.total > 0 ? renderPagination(resolved, "resolved", pendingParams) : "";

    const content = `
    <h2>Approval Requests${infoIcon("approvals-info", INFO_APPROVAL_REQUESTS)}</h2>
    ${totpBanner}

    <div class="card approvals-card">
      <h3 class="card-section">Pending</h3>
      <table>
        <colgroup><col style="width:20px"><col><col style="width:300px"><col style="width:170px"><col style="width:170px"><col style="width:160px"></colgroup>
        <thead>
          <tr><th></th><th>Agent</th><th>Action</th><th>Created</th><th>Expires</th><th>Actions</th></tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
      ${pendingPagination}
    </div>

    ${
        resolved.total > 0
            ? `
    <div class="card approvals-card">
      <h3 class="card-section">Resolved</h3>
      <table>
        <colgroup><col style="width:20px"><col><col style="width:300px"><col style="width:130px"><col style="width:170px"></colgroup>
        <thead>
          <tr><th></th><th>Agent</th><th>Action</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>${resolvedRows}</tbody>
      </table>
      ${resolvedPagination}
    </div>`
            : ""
    }

    <script>window.__PAGE_DATA__ = { totpEnabled: ${totpEnabled}, pendingPage: ${pending.page}, pendingPageSize: ${pending.pageSize}, resolvedPage: ${resolved.page}, resolvedPageSize: ${resolved.pageSize} };</script>
    ${assetTags("pages/owner-approvals/client.ts")}
  `;
    return renderPage("Approvals", content, "/gui/approvals", "owner", renderPageOptions);
}
