import { renderPage, escapeHtml, formatNameWithId } from '../layout.js';

export interface PolicyListEntry {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  policy_yaml?: string;
  error?: string;
}

export interface BindingEntry {
  owner_principal_id: string;
  policy_id: string;
  applies_to_agent_principal_id: string | null;
}

export function renderPolicies(policies: PolicyListEntry[]): string {
  const rows = policies.map((p) => `
    <tr>
      <td class="mono truncate" title="${escapeHtml(p.policy_id)}">
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="table-link">${escapeHtml(p.policy_id.slice(0, 8))}...</a>
      </td>
      <td><span class="mono" style="font-size:12px">${escapeHtml(p.owner_principal_id.slice(0, 8))}...</span></td>
      <td>${p.applies_to_agent_principal_id ? `<span class="mono" style="font-size:12px">${escapeHtml(p.applies_to_agent_principal_id.slice(0, 8))}...</span>` : '<span style="color:var(--text-muted)">all agents</span>'}</td>
      <td>
        <a href="/gui/policies/${escapeHtml(p.policy_id)}" class="btn btn-secondary" style="padding:4px 10px;font-size:12px">View</a>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="page-header">
      <h2>Policies</h2>
      <p>${policies.length} configured polic${policies.length !== 1 ? 'ies' : 'y'}</p>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Policy ID</th>
            <th>Owner</th>
            <th>Applies To</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:24px">No policies configured</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return renderPage('Policies', content, '/gui/policies');
}

export interface PolicyDetail {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
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
      <h2>View Policy</h2>
      <p class="mono">${escapeHtml(policy.policy_id)}</p>
    </div>

    <div class="card">
      <div class="card-title">Policy Details</div>
      <table style="margin-bottom:20px">
        <tbody>
          <tr>
            <td style="width:160px;color:var(--text-muted)">Owner</td>
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
  `;

  return renderPage('View Policy', content, '/gui/policies');
}
