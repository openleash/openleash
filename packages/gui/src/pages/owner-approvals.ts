import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_APPROVAL_REQUESTS,
} from "../layout.js";

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

export interface OwnerApprovalsOptions {
    totp_enabled?: boolean;
    require_totp?: boolean;
    agent_names?: Map<string, string>;
}

function detailRow(label: string, value: string): string {
    return `<tr>
    <td style="color:var(--text-muted);white-space:nowrap;vertical-align:top;padding:4px 12px 4px 0;font-size:12px">${label}</td>
    <td style="padding:4px 0;font-size:12px;word-break:break-all">${value}</td>
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
        `<span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith("communication.") ? ' <span class="badge badge-muted" style="margin-left:4px;font-size:10px">MCP Glove</span>' : ""}`,
    );
    if (a.justification) {
        rows += detailRow("Justification", escapeHtml(a.justification));
    }
    if (a.decision_id) {
        rows += detailRow(
            "Decision ID",
            `<span class="mono" style="font-size:11px">${escapeHtml(a.decision_id)}</span>`,
        );
    }
    if (a.action_hash) {
        rows += detailRow(
            "Action Hash",
            `<span class="mono" style="font-size:11px">${escapeHtml(a.action_hash)}</span>`,
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
    <table style="margin:0"><colgroup><col style="width:120px"><col></colgroup><tbody>${rows}</tbody></table>
    ${
        actionJson
            ? `
      <div style="margin-top:12px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Action Payload</div>
      <div class="accordion-content">${escapeHtml(actionJson)}</div>
    `
            : ""
    }
    ${
        contextJson
            ? `
      <div style="margin-top:12px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Context</div>
      <div class="accordion-content">${escapeHtml(contextJson)}</div>
    `
            : ""
    }
  `;
}

export function renderOwnerApprovals(
    approvals: OwnerApprovalEntry[],
    options?: OwnerApprovalsOptions,
): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const agentNames = options?.agent_names;
    const disableActions = requireTotp && !totpEnabled;
    const pending = approvals.filter((a) => a.status === "PENDING");
    const resolved = approvals.filter((a) => a.status !== "PENDING");

    const pendingRows =
        pending.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No pending approvals</td></tr>'
            : pending
                  .map((a) => {
                      const agentName = agentNames?.get(a.agent_principal_id) ?? null;
                      const agentDisplay = agentName
                          ? escapeHtml(agentName)
                          : escapeHtml(a.agent_id);
                      return `
      <tr class="accordion-row" onclick="toggleApproval('${escapeHtml(a.approval_request_id)}')">
        <td>${agentDisplay} <span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith("communication.") ? ' <span class="badge badge-muted" style="margin-left:4px;font-size:10px">MCP Glove</span>' : ""}</td>
        <td>${formatTimestamp(a.created_at)}</td>
        <td>${formatTimestamp(a.expires_at)}</td>
        <td>
          <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="event.stopPropagation();handleApproval('${a.approval_request_id}', 'approve')" ${disableActions ? "disabled" : ""}>Approve</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--color-danger);color:var(--color-danger)" onclick="event.stopPropagation();handleApproval('${a.approval_request_id}', 'deny')" ${disableActions ? "disabled" : ""}>Deny</button>
        </td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(a.approval_request_id)}">
        <td colspan="5" style="padding:0 12px 16px">
          ${renderDetailPanel(a, agentNames)}
        </td>
      </tr>`;
                  })
                  .join("");

    const resolvedRows =
        resolved.length === 0
            ? ""
            : resolved
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
      <tr class="accordion-row" onclick="toggleApproval('${escapeHtml(a.approval_request_id)}')">
        <td>${agentDisplay} <span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td><span class="badge badge-muted">${escapeHtml(a.action_type)}</span>${a.action_type.startsWith("communication.") ? ' <span class="badge badge-muted" style="margin-left:4px;font-size:10px">MCP Glove</span>' : ""}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${formatTimestamp(a.created_at)}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(a.approval_request_id)}">
        <td colspan="4" style="padding:0 12px 16px">
          ${renderDetailPanel(a, agentNames)}
        </td>
      </tr>`;
                  })
                  .join("");

    const totpBanner =
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error" style="margin-top:16px">Two-factor authentication is required. <a href="/gui/owner/profile" style="color:inherit;text-decoration:underline">Set up 2FA in your Profile.</a></div>'
            : "";

    const content = `
    <h2>Approval Requests${infoIcon("approvals-info", INFO_APPROVAL_REQUESTS)}</h2>
    ${totpBanner}

    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Pending</h3>
      <table>
        <colgroup><col><col style="width:180px"><col style="width:170px"><col style="width:170px"><col style="width:160px"></colgroup>
        <thead>
          <tr><th>Agent</th><th>Action</th><th>Created</th><th>Expires</th><th>Actions</th></tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>

    ${
        resolved.length > 0
            ? `
    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Resolved</h3>
      <table>
        <colgroup><col><col style="width:180px"><col style="width:130px"><col style="width:170px"></colgroup>
        <thead>
          <tr><th>Agent</th><th>Action</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>${resolvedRows}</tbody>
      </table>
    </div>`
            : ""
    }

    <script>
      var totpEnabled = ${totpEnabled};

      function toggleApproval(id) {
        var detail = document.getElementById('detail-' + id);
        var row = detail.previousElementSibling;
        detail.classList.toggle('open');
        row.classList.toggle('expanded');
      }

      async function handleApproval(id, action) {
        const token = sessionStorage.getItem('openleash_session');
        var bodyObj = {};
        if (action === 'deny') {
          var reason = await olPrompt('Reason for denial (optional):', 'Enter reason...', 'Deny Request');
          if (reason === null) return;
          if (reason) bodyObj.reason = reason;
        }
        async function doApproval(totpCode) {
          if (totpCode) bodyObj.totp_code = totpCode;
          try {
            var res = await fetch('/v1/owner/approval-requests/' + id + '/' + action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify(bodyObj),
            });
            if (res.ok) return null;
            var data = await res.json();
            return data.error?.message || 'Failed';
          } catch (e) {
            return 'Network error';
          }
        }
        if (totpEnabled) {
          var result = await ol2FA(doApproval);
          if (!result) return;
          window.location.reload();
        } else {
          var err = await doApproval();
          if (err) olToast(err, 'error');
          else window.location.reload();
        }
      }
    </script>
  `;
    return renderPage("Approvals", content, "/gui/owner/approvals", "owner");
}
