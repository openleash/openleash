import { renderPage, escapeHtml, copyableId, type RenderPageOptions } from '../../shared/layout.js';
import { assetTags } from '../../shared/manifest.js';
import type { TransformationFrontmatter } from '@openleash/core';

export type OwnerTransformationEntry = TransformationFrontmatter;
export interface OwnerTransformationsOptions {
  org_id?: string | null;
  agents?: { id: string; name: string }[];
  groups?: { id: string; name: string }[];
  owner_names?: Map<string, string>;
  can_manage?: boolean;
  totp_enabled?: boolean;
  require_totp?: boolean;
  admin?: boolean;
  detail?: boolean;
  drafts?: TransformationFrontmatter[];
}

export function renderOwnerTransformations(records: OwnerTransformationEntry[], options: OwnerTransformationsOptions = {}, renderOptions?: RenderPageOptions): string {
  const admin = options.admin ?? false;
  const canManage = !admin && (options.can_manage ?? true);
  const prefix = admin ? '/gui/admin/transformations' : '/gui/' + (options.org_id ? 'orgs/' + encodeURIComponent(renderOptions?.scope?.current.slug ?? '') : 'personal') + '/transformations';
  const targetOptions = (selected: string) => [
    { value: 'all', name: 'All agents of this owner' },
    ...(options.agents ?? []).map(a => ({ value: 'agent:' + a.id, name: 'Agent: ' + a.name })),
    ...(options.groups ?? []).map(g => ({ value: 'group:' + g.id, name: 'Group: ' + g.name })),
  ].map(x => `<option value="${escapeHtml(x.value)}" ${x.value === selected ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('');
  function editor(t?: TransformationFrontmatter) {
    const rule = t?.rule;
    const target = t?.applies_to_agent_principal_id ? 'agent:' + t.applies_to_agent_principal_id : t?.applies_to_group_id ? 'group:' + t.applies_to_group_id : 'all';
    return `<div class="otr-editor">
      <label>Name<input class="form-input" data-field="name" maxlength="120" value="${escapeHtml(t?.name ?? '')}"></label>
      <label>Description<textarea class="form-input" data-field="description" maxlength="500">${escapeHtml(t?.description ?? '')}</textarea></label>
      <label>Applies to<select class="form-select" data-field="target">${targetOptions(target)}</select></label>
      <label>On failure<select class="form-select" data-field="failure_policy"><option value="block" ${t?.failure_policy !== 'continue' ? 'selected' : ''}>Block output</option><option value="continue" ${t?.failure_policy === 'continue' ? 'selected' : ''}>Continue without this rule</option></select></label>
      <label>Type<select class="form-select" data-field="type"><option value="cap_output_length" ${rule?.type !== 'regex_replace' ? 'selected' : ''}>Length cap</option><option value="regex_replace" ${rule?.type === 'regex_replace' ? 'selected' : ''}>Regex replacement</option></select></label>
      <div class="otr-cap ${rule?.type === 'regex_replace' ? 'hidden' : ''}">
        <label>Maximum characters<input class="form-input" type="number" min="1" max="1048576" data-field="max_characters" value="${rule?.type === 'cap_output_length' ? rule.max_characters ?? '' : ''}"></label>
        <label>Maximum lines<input class="form-input" type="number" min="1" max="1048576" data-field="max_lines" value="${rule?.type === 'cap_output_length' ? rule.max_lines ?? '' : ''}"></label>
      </div>
      <div class="otr-regex ${rule?.type !== 'regex_replace' ? 'hidden' : ''}">
        <label>Pattern<input class="form-input" data-field="from_pattern" maxlength="2048" value="${escapeHtml(rule?.type === 'regex_replace' ? rule.from_pattern : '')}"></label>
        <label>Literal replacement<input class="form-input" data-field="to_pattern" maxlength="4096" value="${escapeHtml(rule?.type === 'regex_replace' ? rule.to_pattern : '')}"></label>
      </div>
    </div>`;
  }
  const rows = records.map((t, index) => {
    const target = t.applies_to_agent_principal_id
      ? (options.agents?.find(a => a.id === t.applies_to_agent_principal_id)?.name ?? t.applies_to_agent_principal_id)
      : t.applies_to_group_id ? 'Group: ' + (options.groups?.find(g => g.id === t.applies_to_group_id)?.name ?? t.applies_to_group_id) : 'All agents';
    const owner = options.owner_names?.get(t.owner_id) ?? t.owner_id;
    return `<tr class="otr-row" data-transformation-id="${escapeHtml(t.transformation_id)}" data-revision="${t.revision ?? 1}" data-type="${t.rule.type}">
      <td><a href="${prefix}/${encodeURIComponent(t.transformation_id)}">${escapeHtml(t.name || 'Unnamed transformation')}</a><div>${copyableId(t.transformation_id)}</div><div class="text-muted">Revision ${t.revision ?? 1}${admin ? ' | ' + escapeHtml(owner) : ''}</div>${t.draft ? `<div>${escapeHtml(t.draft.status)}</div>` : ''}</td>
      <td><code>${escapeHtml(t.rule.type)}</code><pre class="otr-rule">${escapeHtml(JSON.stringify(t.rule, null, 2))}</pre>${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
        ${canManage ? `<details ${options.detail ? 'open' : ''}><summary>Edit</summary>${editor(t)}<button class="btn btn-primary" data-save-transformation="${t.transformation_id}">Save</button> <button class="btn btn-secondary" data-preview>Preview</button></details>` : ''}
      </td><td>${escapeHtml(target)}</td><td>${escapeHtml(t.failure_policy ?? 'block')}</td>
      <td><input type="checkbox" class="otr-enabled" ${t.enabled ? 'checked' : ''} ${canManage ? '' : 'disabled'} aria-label="Enabled"></td>
      <td>${canManage ? `<button class="btn btn-secondary" data-delete-transformation="${t.transformation_id}">Delete</button>${!options.detail ? `<button class="btn btn-secondary" data-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move up">Up</button><button class="btn btn-secondary" data-move="1" ${index === records.length - 1 ? 'disabled' : ''} aria-label="Move down">Down</button>` : ''}` : 'Read only'}</td></tr>`;
  }).join('');
  const drafts = (options.drafts ?? []).filter(t => t.draft?.status === 'PENDING').map(t => `<tr>
    <td>${escapeHtml(t.name || 'Unnamed proposal')}<div>${copyableId(t.transformation_id)}</div></td>
    <td>${escapeHtml(options.agents?.find(a => a.id === t.draft?.agent_principal_id)?.name ?? t.draft?.agent_principal_id ?? '')}</td>
    <td>${escapeHtml(t.draft?.justification ?? '')}<pre class="otr-rule">${escapeHtml(JSON.stringify(t.rule, null, 2))}</pre></td>
    <td>${canManage ? `<button class="btn btn-primary" data-draft-id="${t.transformation_id}" data-resolve="approve">Approve</button> <button class="btn btn-secondary" data-draft-id="${t.transformation_id}" data-resolve="deny">Deny</button>` : 'Read only'}</td></tr>`).join('');
  const history = (options.drafts ?? []).filter(t => t.draft?.status !== 'PENDING').map(t => `<tr><td>${escapeHtml(t.name || 'Unnamed proposal')}</td><td>${escapeHtml(t.draft?.status ?? '')}</td><td>${escapeHtml(t.draft?.denial_reason ?? '')}</td><td>${escapeHtml(t.draft?.resolved_at ?? '')}</td></tr>`).join('');
  const data = JSON.stringify({ orgId: options.org_id ?? null, canManage, totpEnabled: options.totp_enabled ?? false }).replace(/</g, '\\u003c');
  const content = `<h2>Output Transformations</h2>
    ${options.detail ? `<p><a href="${prefix}">All transformations</a></p>` : ''}
    <p>Enabled rules form one ordered chain. Every applicable rule runs from top to bottom; agent and group rules do not override owner-wide rules. Length caps also constrain the final output.</p>
    ${admin ? '<p>Read-only view across owners. Make changes in the owning personal or organization workspace.</p>' : !canManage ? '<p>Your organization role allows viewing. An organization admin can make changes.</p>' : ''}
    ${options.require_totp && !options.totp_enabled ? '<p class="alert alert-error">Set up two-factor authentication in your profile before deleting rules or resolving proposals.</p>' : ''}
    <div class="card otr-scroll"><table class="table"><thead><tr><th>Name</th><th>Rule</th><th>Applies to</th><th>On failure</th><th>Enabled</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No transformations configured.</td></tr>'}</tbody></table></div>
    ${canManage && !options.detail ? `<details class="card" id="otr-create"><summary>Create transformation</summary>${editor()}<button class="btn btn-primary" id="otr-create-btn">Create</button> <button class="btn btn-secondary" data-preview>Preview</button></details>` : ''}
    ${canManage ? `<div class="card"><h3>Preview with sample text</h3><p>Enter synthetic sample text, then press Preview beside the rule. The sample is sent to this OpenLeash server for preview and is not written to its audit log.</p><label>Sample text<textarea class="form-input" id="otr-sample" maxlength="65536"></textarea></label><label>Result<textarea class="form-input" id="otr-preview-output" readonly></textarea></label><p id="otr-preview-status" role="status"></p></div>` : ''}
    ${!admin && !options.detail ? `<div class="card"><h3>Pending transformation proposals</h3><p>Agents can propose rules for their own output. Approval activates the rule with output blocking on failure.</p><table class="table"><thead><tr><th>Proposal</th><th>Agent</th><th>Reason and rule</th><th>Actions</th></tr></thead><tbody>${drafts || '<tr><td colspan="4">No pending proposals.</td></tr>'}</tbody></table></div>` : ''}
    ${!admin && !options.detail && history ? `<details class="card"><summary>Resolved proposals</summary><table class="table"><thead><tr><th>Proposal</th><th>Status</th><th>Reason</th><th>Resolved</th></tr></thead><tbody>${history}</tbody></table></details>` : ''}
    <script>window.__PAGE_DATA__ = ${data};</script>${assetTags('pages/owner-transformations/client.ts')}`;
  return renderPage('Transformations', content, admin ? '/gui/admin/transformations' : '/gui/transformations', admin ? 'admin' : 'owner', renderOptions);
}
