import { renderPage, escapeHtml, formatNameWithId, copyableId, infoIcon, INFO_DECISIONS, INFO_OBLIGATIONS } from '../../shared/layout.js';
import { assetTags } from '../../shared/manifest.js';


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
    const descLine = p.description ? `<div class="policies-description">${escapeHtml(p.description)}</div>` : '';
    return `
    <tr>
      <td>
        ${p.name ? `<a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.name)}</a>` : ''}
        ${descLine}
        <div class="policies-copyable-wrap"><a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.policy_id)}</a></div>
      </td>
      <td>${copyableId(p.owner_principal_id)}</td>
      <td>${p.applies_to_agent_principal_id ? copyableId(p.applies_to_agent_principal_id) : '<span class="text-muted">all agents</span>'}</td>
      <td>
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="btn btn-secondary btn-sm">View</a>
      </td>
    </tr>`;
  }).join('');

  const emptyState = `
    <div class="card empty-state">
      <div class="material-symbols-outlined">policy</div>
      <div class="empty-state-title">No Policies Yet</div>
      <p class="empty-state-text">
        Policies are created by owners through the
        <a href="/gui/owner/login" class="link-green">Owner Portal</a>.
        Each owner can create YAML-based authorization rules for their agents from the
        <strong class="text-primary-force">My Policies</strong> section of their portal.
      </p>
    </div>

    <div class="card">
      <div class="card-title">How Policies Work</div>
      <div class="grid-2col gap-24">
        <div>
          <div class="detail-title">Creating Policies</div>
          <p class="detail-text">
            Owners create policies in the Owner Portal under <strong class="text-primary-force">My Policies</strong>.
            Policies are written in YAML and define rules that control what actions an agent is allowed to perform.
            A policy can apply to a specific agent or to all of an owner's agents.
          </p>
        </div>
        <div>
          <div class="detail-title">Policy Structure</div>
          <p class="detail-text">
            Each policy has a <span class="mono policies-mono-sm">default</span> decision (allow or deny) and a list of
            <span class="mono policies-mono-sm">rules</span>. Rules match on action types and can include constraints
            (e.g. amount limits, time windows) and obligations${infoIcon('policy-obligations', INFO_OBLIGATIONS)} (e.g. require human approval).
          </p>
        </div>
        <div>
          <div class="detail-title">Decisions${infoIcon('policy-decisions', INFO_DECISIONS)}</div>
          <p class="detail-text">
            Rules evaluate to one of five decisions:
            <span class="badge badge-green">ALLOW</span>
            <span class="badge badge-red">DENY</span>
            <span class="badge badge-amber">REQUIRE_APPROVAL</span>
            <span class="badge badge-amber">REQUIRE_STEP_UP</span>
            <span class="badge badge-amber">REQUIRE_DEPOSIT</span>
          </p>
        </div>
        <div>
          <div class="detail-title">Example</div>
          <div class="config-block policies-example">version: 1
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

    ${assetTags("pages/policies/client.ts")}
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
      <td>${b.applies_to_agent_principal_id ? formatNameWithId(agentMap.get(b.applies_to_agent_principal_id), b.applies_to_agent_principal_id) : '<span class="text-muted">all agents</span>'}</td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header">
      <h2>${policy.name ? escapeHtml(policy.name) : 'View Policy'}</h2>
      ${policy.description ? `<p class="text-secondary">${escapeHtml(policy.description)}</p>` : ''}
      <p>${copyableId(policy.policy_id, policy.policy_id.length)}</p>
    </div>

    <div class="card">
      <div class="card-title">Policy Details</div>
      <table class="policies-table-bottom">
        <colgroup><col style="width:160px"><col></colgroup>
        <tbody>
          ${policy.name ? `<tr>
            <td class="text-muted">Name</td>
            <td>${escapeHtml(policy.name)}</td>
          </tr>` : ''}
          ${policy.description ? `<tr>
            <td class="text-muted">Description</td>
            <td>${escapeHtml(policy.description)}</td>
          </tr>` : ''}
          <tr>
            <td class="text-muted">Owner</td>
            <td>${formatNameWithId(ownerMap.get(policy.owner_principal_id), policy.owner_principal_id)}</td>
          </tr>
          <tr>
            <td class="text-muted">Applies To</td>
            <td>${policy.applies_to_agent_principal_id ? formatNameWithId(agentMap.get(policy.applies_to_agent_principal_id), policy.applies_to_agent_principal_id) : 'All agents'}</td>
          </tr>
        </tbody>
      </table>

      <div class="card-title">Policy YAML</div>
      <textarea class="yaml-editor" readonly>${escapeHtml(policy.policy_yaml)}</textarea>

      <div class="toolbar policies-toolbar">
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
      ` : '<p class="policies-no-bindings">No active bindings for this policy</p>'}
    </div>

    ${assetTags("pages/policies/client.ts")}
  `;

  return renderPage('View Policy', content, '/gui/policies');
}
