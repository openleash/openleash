import { renderPage, escapeHtml, copyableId, formatTimestamp, infoIcon, INFO_POLICY_DRAFTS } from '../layout.js';

export interface OwnerPolicyEntry {
  policy_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml?: string;
}

export interface OwnerPolicyDraftEntry {
  policy_draft_id: string;
  agent_id: string;
  agent_principal_id: string;
  applies_to_agent_principal_id: string | null;
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
    return `<span class="badge badge-amber" style="font-size:10px" title="This policy will apply to ALL your agents, not just the one suggesting it">All agents</span>`;
  }
  if (isSelf) {
    const name = agentNames?.get(d.applies_to_agent_principal_id!) ?? null;
    const display = name
      ? `${escapeHtml(name)} (self)`
      : `${copyableId(d.applies_to_agent_principal_id!)} <span style="color:var(--text-muted);font-size:11px">(self)</span>`;
    return display;
  }
  // Other agent
  const name = agentNames?.get(d.applies_to_agent_principal_id!) ?? null;
  const display = name
    ? escapeHtml(name)
    : copyableId(d.applies_to_agent_principal_id!);
  return `${display} <span class="badge badge-amber" style="font-size:10px;margin-left:4px" title="This agent is suggesting a policy for a DIFFERENT agent">other agent</span>`;
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
    return `<div class="alert" style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);color:var(--amber-bright);padding:8px 12px;margin-top:8px;font-size:12px">
      <strong>Broad scope:</strong> Agent <span class="mono">${escapeHtml(d.agent_id)}</span> is proposing a policy that applies to <strong>all your agents</strong>, not just itself. Review carefully.
    </div>`;
  }
  if (!isSelf) {
    return `<div class="alert" style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);color:var(--amber-bright);padding:8px 12px;margin-top:8px;font-size:12px">
      <strong>Cross-agent:</strong> Agent <span class="mono">${escapeHtml(d.agent_id)}</span> is proposing a policy for a <strong>different agent</strong> (${copyableId(d.applies_to_agent_principal_id!)}). Review carefully.
    </div>`;
  }
  return '';
}

export function renderOwnerPolicies(
  policies: OwnerPolicyEntry[],
  drafts: OwnerPolicyDraftEntry[],
  options?: OwnerPoliciesOptions
): string {
  const totpEnabled = options?.totp_enabled ?? false;
  const requireTotp = options?.require_totp ?? false;
  const agentNames = options?.agent_names;
  const disableActions = requireTotp && !totpEnabled;
  const pending = drafts.filter((d) => d.status === 'PENDING');
  const resolved = drafts.filter((d) => d.status !== 'PENDING');

  // --- Active Policies section ---
  const policyRows = policies.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px">No policies</td></tr>'
    : policies.map((p) => {
      let appliesTo: string;
      if (!p.applies_to_agent_principal_id) {
        appliesTo = '<span class="badge badge-amber" style="font-size:10px" title="This policy applies to ALL your agents">All agents</span>';
      } else {
        const name = agentNames?.get(p.applies_to_agent_principal_id) ?? null;
        appliesTo = name ? escapeHtml(name) : copyableId(p.applies_to_agent_principal_id);
      }
      return `
      <tr id="policy-row-${escapeHtml(p.policy_id)}">
        <td>${copyableId(p.policy_id)}</td>
        <td>${appliesTo}</td>
        <td>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px" onclick="toggleEditor('${escapeHtml(p.policy_id)}')">Edit</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--red-bright);color:var(--red-bright)" onclick="deletePolicy('${escapeHtml(p.policy_id)}')">Delete</button>
        </td>
      </tr>
      <tr id="editor-row-${escapeHtml(p.policy_id)}" class="hidden">
        <td colspan="3" style="padding:12px 16px;background:var(--bg-elevated)">
          <div id="editor-status-${escapeHtml(p.policy_id)}"></div>
          <textarea id="editor-yaml-${escapeHtml(p.policy_id)}" class="yaml-editor" style="width:100%;height:240px;margin-bottom:8px;font-size:13px">${escapeHtml(p.policy_yaml ?? '')}</textarea>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="savePolicy('${escapeHtml(p.policy_id)}')">Save</button>
            <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px" onclick="toggleEditor('${escapeHtml(p.policy_id)}')">Cancel</button>
          </div>
        </td>
      </tr>
    `;}).join('');

  // --- Pending Drafts section ---
  const totpBanner = requireTotp && !totpEnabled
    ? '<div class="alert alert-error" style="margin-top:16px">Two-factor authentication is required to approve or deny drafts. <a href="/gui/owner/profile" style="color:inherit;text-decoration:underline">Set up 2FA in your Profile.</a></div>'
    : '';

  const pendingRows = pending.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No pending policy drafts</td></tr>'
    : pending.map((d) => `
      <tr class="accordion-row" onclick="toggleDraft('${escapeHtml(d.policy_draft_id)}')">
        <td>${copyableId(d.policy_draft_id)} <span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${suggestedByCell(d, agentNames)}</td>
        <td>${appliesToCell(d, agentNames)}</td>
        <td${d.justification ? ` title="${escapeHtml(d.justification)}"` : ''}>${d.justification ? escapeHtml(d.justification) : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${formatTimestamp(d.created_at)}</td>
        <td>
          <button class="btn btn-primary" style="font-size:12px;padding:4px 12px" onclick="event.stopPropagation();handleDraft('${d.policy_draft_id}', 'approve')" ${disableActions ? 'disabled' : ''}>Approve</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;margin-left:4px;border-color:var(--red-bright);color:var(--red-bright)" onclick="event.stopPropagation();handleDraft('${d.policy_draft_id}', 'deny')" ${disableActions ? 'disabled' : ''}>Deny</button>
        </td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(d.policy_draft_id)}">
        <td colspan="6" style="padding:0 12px 16px">
          ${scopeWarning(d)}
          <div style="margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Proposed Policy YAML</div>
          <div class="accordion-content">${escapeHtml(d.policy_yaml)}</div>
        </td>
      </tr>
    `).join('');

  // --- Resolved Drafts section ---
  const resolvedRows = resolved.length === 0
    ? ''
    : resolved.map((d) => {
      const badge = d.status === 'APPROVED' ? 'badge-green' : d.status === 'DENIED' ? 'badge-red' : 'badge-muted';
      return `
      <tr class="accordion-row" onclick="toggleDraft('${escapeHtml(d.policy_draft_id)}')">
        <td>${copyableId(d.policy_draft_id)} <span class="chevron material-symbols-outlined">chevron_right</span></td>
        <td>${suggestedByCell(d, agentNames)}</td>
        <td>${appliesToCell(d, agentNames)}</td>
        <td><span class="badge ${badge}">${escapeHtml(d.status)}</span></td>
        <td>${d.resulting_policy_id
          ? `<a href="#policy-row-${escapeHtml(d.resulting_policy_id)}" style="color:var(--green-bright);text-decoration:none" title="Scroll to active policy">${copyableId(d.resulting_policy_id)}</a>`
          : d.denial_reason ? escapeHtml(d.denial_reason) : '<span style="color:var(--text-muted)">-</span>'}</td>
        <td>${formatTimestamp(d.created_at)}</td>
      </tr>
      <tr class="accordion-detail" id="detail-${escapeHtml(d.policy_draft_id)}">
        <td colspan="6" style="padding:0 12px 16px">
          ${scopeWarning(d)}
          <div style="margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Proposed Policy YAML</div>
          <div class="accordion-content">${escapeHtml(d.policy_yaml)}</div>
        </td>
      </tr>`;
    }).join('');

  const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <h2>My Policies</h2>
      <a href="/gui/owner/policies/create" class="btn btn-primary" style="text-decoration:none"><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:4px">add</span>Create Policy</a>
    </div>

    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Active Policies</h3>
      <table>
        <colgroup><col style="width:290px"><col><col style="width:150px"></colgroup>
        <thead>
          <tr><th>Policy ID</th><th>Applies To</th><th>Actions</th></tr>
        </thead>
        <tbody>${policyRows}</tbody>
      </table>
    </div>

    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Pending Drafts${infoIcon('policy-drafts-info', INFO_POLICY_DRAFTS)}</h3>
      <p style="color:var(--text-secondary);font-size:13px;padding:0 20px;margin:8px 0">
        Your agents can propose new policies. Review and approve or deny them here.
      </p>
      ${totpBanner}
      <table>
        <colgroup><col style="width:290px"><col><col><col><col style="width:170px"><col style="width:180px"></colgroup>
        <thead>
          <tr><th>ID</th><th>Suggested By</th><th>Applies To</th><th>Justification</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
    </div>

    ${resolved.length > 0 ? `
    <div class="card" style="padding:0;margin-top:20px">
      <h3 style="padding:16px 20px;margin:0;border-bottom:1px solid var(--border-subtle)">Resolved Drafts</h3>
      <table>
        <colgroup><col style="width:290px"><col><col><col style="width:130px"><col style="width:290px"><col style="width:170px"></colgroup>
        <thead>
          <tr><th>ID</th><th>Suggested By</th><th>Applies To</th><th>Status</th><th>Result</th><th>Created</th></tr>
        </thead>
        <tbody>${resolvedRows}</tbody>
      </table>
    </div>` : ''}

    <div id="resultMsg" class="alert" style="display:none;margin-top:16px"></div>

    <script>
      var token = sessionStorage.getItem('openleash_session');
      var totpEnabled = ${totpEnabled};

      function toggleEditor(policyId) {
        var editorRow = document.getElementById('editor-row-' + policyId);
        editorRow.classList.toggle('hidden');
      }

      function toggleDraft(id) {
        var detail = document.getElementById('detail-' + id);
        var row = detail.previousElementSibling;
        detail.classList.toggle('open');
        row.classList.toggle('expanded');
      }

      async function savePolicy(policyId) {
        var yaml = document.getElementById('editor-yaml-' + policyId).value;
        var statusDiv = document.getElementById('editor-status-' + policyId);
        statusDiv.innerHTML = '';

        var res = await fetch('/v1/owner/policies/' + policyId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ policy_yaml: yaml }),
        });

        if (res.ok) {
          statusDiv.innerHTML = '<div class="alert alert-success" style="margin-bottom:8px">Policy saved</div>';
          setTimeout(function() { statusDiv.innerHTML = ''; }, 3000);
        } else {
          var data = await res.json();
          statusDiv.innerHTML = '<div class="alert alert-error" style="margin-bottom:8px">' + (data.error?.message || 'Failed to save').replace(/</g, '&lt;') + '</div>';
        }
      }

      async function deletePolicy(id) {
        if (!await olConfirm('Are you sure you want to delete this policy?', 'Delete Policy')) return;
        var res = await fetch('/v1/owner/policies/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token },
        });
        if (res.ok) window.location.reload();
        else olAlert('Failed to delete policy', 'Error');
      }

      async function handleDraft(id, action) {
        var bodyObj = {};
        if (action === 'deny') {
          var reason = await olPrompt('Reason for denial (optional):', 'Enter reason...', 'Deny Draft');
          if (reason === null) return;
          if (reason) bodyObj.reason = reason;
        }
        if (totpEnabled) {
          var code = await olPrompt('Enter your 2FA code:', '000000', 'Two-Factor Authentication');
          if (!code) return;
          bodyObj.totp_code = code;
        }
        var body = JSON.stringify(bodyObj);
        try {
          var res = await fetch('/v1/owner/policy-drafts/' + id + '/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: body,
          });
          if (res.ok) {
            window.location.reload();
          } else {
            var data = await res.json();
            var el = document.getElementById('resultMsg');
            el.className = 'alert alert-error';
            el.textContent = data.error?.message || 'Failed';
            el.style.display = 'block';
          }
        } catch (err) {
          olAlert('Network error', 'Error');
        }
      }
    </script>
  `;
  return renderPage('My Policies', content, '/gui/owner/policies', 'owner');
}
