import { renderPage, escapeHtml, formatNameWithId, copyableId, infoIcon, INFO_DECISIONS, INFO_OBLIGATIONS } from '../layout.js';
import { assetTags } from '../manifest.js';

export interface PolicyListEntry {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  name: string | null;
  description: string | null;
  policy_yaml?: string;
  error?: string;
}

export interface BindingEntry {
  owner_principal_id: string;
  policy_id: string;
  applies_to_agent_principal_id: string | null;
}

export function renderPolicies(policies: PolicyListEntry[]): string {
  const rows = policies.map((p) => {
    const displayName = p.name ? escapeHtml(p.name) : `<span style="color:var(--text-muted)">${escapeHtml(p.policy_id.slice(0, 8))}...</span>`;
    const descLine = p.description ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${escapeHtml(p.description)}</div>` : '';
    return `
    <tr>
      <td>
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${displayName}</a>
        ${descLine}
        <div style="margin-top:2px">${copyableId(p.policy_id)}</div>
      </td>
      <td>${copyableId(p.owner_principal_id)}</td>
      <td>${p.applies_to_agent_principal_id ? copyableId(p.applies_to_agent_principal_id) : '<span style="color:var(--text-muted)">all agents</span>'}</td>
      <td>
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="btn btn-secondary" style="padding:4px 10px;font-size:12px">View</a>
      </td>
    </tr>`;
  }).join('');

  const emptyState = `
    <div class="card" style="text-align:center;padding:48px 24px">
      <div class="material-symbols-outlined" style="font-size:48px;margin-bottom:16px;opacity:0.3">policy</div>
      <div style="font-weight:600;color:var(--text-primary);font-size:15px;margin-bottom:8px">No Policies Yet</div>
      <p style="color:var(--text-secondary);font-size:13px;max-width:520px;margin:0 auto;line-height:1.7">
        Policies are created by owners through the
        <a href="/gui/owner/login" style="color:var(--green-bright)">Owner Portal</a>.
        Each owner can create YAML-based authorization rules for their agents from the
        <strong style="color:var(--text-primary)">My Policies</strong> section of their portal.
      </p>
    </div>

    <div class="card">
      <div class="card-title">How Policies Work</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Creating Policies</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            Owners create policies in the Owner Portal under <strong style="color:var(--text-primary)">My Policies</strong>.
            Policies are written in YAML and define rules that control what actions an agent is allowed to perform.
            A policy can apply to a specific agent or to all of an owner's agents.
          </p>
        </div>
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Policy Structure</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            Each policy has a <span class="mono" style="font-size:11px">default</span> decision (allow or deny) and a list of
            <span class="mono" style="font-size:11px">rules</span>. Rules match on action types and can include constraints
            (e.g. amount limits, time windows) and obligations${infoIcon('policy-obligations', INFO_OBLIGATIONS)} (e.g. require human approval).
          </p>
        </div>
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Decisions${infoIcon('policy-decisions', INFO_DECISIONS)}</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            Rules evaluate to one of five decisions:
            <span class="badge badge-green">ALLOW</span>
            <span class="badge badge-red">DENY</span>
            <span class="badge badge-amber">REQUIRE_APPROVAL</span>
            <span class="badge badge-amber">REQUIRE_STEP_UP</span>
            <span class="badge badge-amber">REQUIRE_DEPOSIT</span>
          </p>
        </div>
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Example</div>
          <div class="config-block" style="font-size:11px;line-height:1.6">version: 1
default: deny
rules:
  - id: allow_read
    effect: allow
    action: "data.read"
  - id: approve_write
    effect: allow
    action: "data.write"
    obligations:
      - type: HUMAN_APPROVAL</div>
        </div>
      </div>
    </div>
  `;

  const content = `
    <div class="page-header">
      <h2>Policies</h2>
      <p>${policies.length} configured polic${policies.length !== 1 ? 'ies' : 'y'}</p>
    </div>

    ${policies.length === 0 ? emptyState : `
    <div class="card">
      <table>
        <colgroup><col><col style="width:290px"><col style="width:200px"><col style="width:100px"></colgroup>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Owner</th>
            <th>Applies To</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    `}

    ${assetTags("pages/policies.ts")}
  `;

  return renderPage('Policies', content, '/gui/policies');
}

export interface PolicyDetail {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  name: string | null;
  description: string | null;
  policy_yaml: string;
}

export function renderPolicyViewer(policy: PolicyDetail, bindings?: BindingEntry[], nameMap?: { owners: Map<string, string>; agents: Map<string, string> }): string {
  const policyBindings = (bindings ?? []).filter((b) => b.policy_id === policy.policy_id);
  const bindingCount = policyBindings.length;
  const ownerMap = nameMap?.owners ?? new Map();
  const agentMap = nameMap?.agents ?? new Map();

  const bindingRows = policyBindings.map((b) => `
    <tr>
      <td>${formatNameWithId(ownerMap.get(b.owner_principal_id), b.owner_principal_id)}</td>
      <td>${b.applies_to_agent_principal_id ? formatNameWithId(agentMap.get(b.applies_to_agent_principal_id), b.applies_to_agent_principal_id) : '<span style="color:var(--text-muted)">all agents</span>'}</td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header">
      <h2>${policy.name ? escapeHtml(policy.name) : 'View Policy'}</h2>
      ${policy.description ? `<p style="color:var(--text-secondary)">${escapeHtml(policy.description)}</p>` : ''}
      <p>${copyableId(policy.policy_id, policy.policy_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Policy Details</div>
      <table style="margin-bottom:20px">
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          ${policy.name ? `<tr>
            <td style="color:var(--text-muted)">Name</td>
            <td>${escapeHtml(policy.name)}</td>
          </tr>` : ''}
          ${policy.description ? `<tr>
            <td style="color:var(--text-muted)">Description</td>
            <td>${escapeHtml(policy.description)}</td>
          </tr>` : ''}
          <tr>
            <td style="color:var(--text-muted)">Owner</td>
            <td>${formatNameWithId(ownerMap.get(policy.owner_principal_id), policy.owner_principal_id)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Applies To</td>
            <td>${policy.applies_to_agent_principal_id ? formatNameWithId(agentMap.get(policy.applies_to_agent_principal_id), policy.applies_to_agent_principal_id) : 'All agents'}</td>
          </tr>
        </tbody>
      </table>

      <div class="card-title">Policy YAML</div>
      <textarea class="yaml-editor" readonly>${escapeHtml(policy.policy_yaml)}</textarea>

      <div class="toolbar" style="margin-top:16px">
        <a href="/gui/policies" class="btn btn-secondary">Back to List</a>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Bindings (${bindingCount})</div>
      ${bindingCount > 0 ? `
      <table>
        <colgroup><col style="width:290px"><col></colgroup>
        <thead>
          <tr>
            <th>Owner</th>
            <th>Applies To</th>
          </tr>
        </thead>
        <tbody>${bindingRows}</tbody>
      </table>
      ` : '<p style="color:var(--text-muted);padding:8px 0">No active bindings for this policy</p>'}
    </div>

    ${assetTags("pages/policies.ts")}
  `;

  return renderPage('View Policy', content, '/gui/policies');
}
