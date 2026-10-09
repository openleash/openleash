import {
  renderPage, escapeHtml, copyableId, infoIcon, formatTimestamp,
  INFO_OUTPUT_TRANSFORMATIONS, INFO_TRANSFORMATION_DRAFTS, type RenderPageOptions,
} from '../../shared/layout.js';
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
  create?: boolean;
  drafts?: TransformationFrontmatter[];
}

export function renderOwnerTransformations(records: OwnerTransformationEntry[], options: OwnerTransformationsOptions = {}, renderOptions?: RenderPageOptions): string {
  const admin = options.admin ?? false;
  const canManage = !admin && (options.can_manage ?? true);
  const prefix = admin ? '/gui/admin/transformations' : '/gui/' + (options.org_id ? 'orgs/' + encodeURIComponent(renderOptions?.scope?.current.slug ?? '') : 'personal') + '/transformations';
  const editing = canManage && (options.create || options.detail);
  const record = options.detail ? records[0] : undefined;
  const title = editing ? (options.create ? 'Create Transformation' : 'Edit Transformation') : 'Output Transformations';
  const targetOptions = (selected: string) => [
    { value: 'all', name: 'All agents of this owner' },
    ...(options.agents ?? []).map(a => ({ value: 'agent:' + a.id, name: 'Agent: ' + a.name })),
    ...(options.groups ?? []).map(g => ({ value: 'group:' + g.id, name: 'Group: ' + g.name })),
  ].map(x => `<option value="${escapeHtml(x.value)}" ${x.value === selected ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('');
  function editor(t?: TransformationFrontmatter) {
    const rule = t?.rule;
    const target = t?.applies_to_agent_principal_id ? 'agent:' + t.applies_to_agent_principal_id : t?.applies_to_group_id ? 'group:' + t.applies_to_group_id : 'all';
    return `<div class="otr-editor">
      <div class="otr-fields">
        <div class="form-group"><label for="otr-name">Name</label><input id="otr-name" class="form-input" data-field="name" maxlength="120" value="${escapeHtml(t?.name ?? '')}" placeholder="e.g. Redact account numbers"></div>
        <div class="form-group"><label for="otr-description">Description</label><input id="otr-description" class="form-input" data-field="description" maxlength="500" value="${escapeHtml(t?.description ?? '')}" placeholder="What does this transformation do?"></div>
      </div>
      <div class="form-group"><label for="otr-target">Applies to</label><select id="otr-target" class="form-select" data-field="target">${targetOptions(target)}</select></div>
      <div class="form-group"><label for="otr-failure">On failure</label><select id="otr-failure" class="form-select" data-field="failure_policy"><option value="block" ${t?.failure_policy !== 'continue' ? 'selected' : ''}>Block output</option><option value="continue" ${t?.failure_policy === 'continue' ? 'selected' : ''}>Continue without this rule</option></select></div>
      <div class="form-group"><label for="otr-type">Type</label><select id="otr-type" class="form-select" data-field="type"><option value="cap_output_length" ${rule?.type !== 'regex_replace' ? 'selected' : ''}>Length cap</option><option value="regex_replace" ${rule?.type === 'regex_replace' ? 'selected' : ''}>Regex replacement</option></select></div>
      <div class="otr-cap ${rule?.type === 'regex_replace' ? 'hidden' : ''}">
        <div class="form-group"><label for="otr-max-characters">Maximum characters</label><input id="otr-max-characters" class="form-input" type="number" min="1" max="1048576" data-field="max_characters" value="${rule?.type === 'cap_output_length' ? rule.max_characters ?? '' : ''}"></div>
        <div class="form-group"><label for="otr-max-lines">Maximum lines</label><input id="otr-max-lines" class="form-input" type="number" min="1" max="1048576" data-field="max_lines" value="${rule?.type === 'cap_output_length' ? rule.max_lines ?? '' : ''}"></div>
      </div>
      <div class="otr-regex ${rule?.type !== 'regex_replace' ? 'hidden' : ''}">
        <div class="form-group"><label for="otr-pattern">Pattern</label><input id="otr-pattern" class="form-input" data-field="from_pattern" maxlength="2048" value="${escapeHtml(rule?.type === 'regex_replace' ? rule.from_pattern : '')}"></div>
        <div class="form-group"><label for="otr-replacement">Literal replacement</label><input id="otr-replacement" class="form-input" data-field="to_pattern" maxlength="4096" value="${escapeHtml(rule?.type === 'regex_replace' ? rule.to_pattern : '')}"></div>
      </div>
    </div>`;
  }
  const rows = records.map(t => {
    const target = t.applies_to_agent_principal_id
      ? escapeHtml(options.agents?.find(a => a.id === t.applies_to_agent_principal_id)?.name ?? t.applies_to_agent_principal_id)
      : t.applies_to_group_id
        ? `<span class="badge badge-blue">${escapeHtml(options.groups?.find(g => g.id === t.applies_to_group_id)?.name ?? t.applies_to_group_id)}</span>`
        : '<span class="badge badge-amber">All agents</span>';
    const owner = options.owner_names?.get(t.owner_id) ?? t.owner_id;
    const rule = t.rule.type === 'cap_output_length'
      ? [t.rule.max_characters ? `${t.rule.max_characters} characters` : '', t.rule.max_lines ? `${t.rule.max_lines} lines` : ''].filter(Boolean).join(', ')
      : `<code>${escapeHtml(t.rule.from_pattern)}</code><div class="text-muted">Replace with <code>${escapeHtml(t.rule.to_pattern) || '(empty)'}</code></div>`;
    return `<tr class="otr-row" ${canManage ? 'draggable="true"' : ''} data-transformation-id="${escapeHtml(t.transformation_id)}" data-revision="${t.revision ?? 1}">
      ${canManage ? `<td class="otr-drag-cell"><button type="button" class="otr-drag-handle" aria-label="Reorder ${escapeHtml(t.name || 'transformation')}" title="Drag to reorder, or use the arrow keys"><span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span></button></td>` : ''}
      <td><div class="otr-name">${escapeHtml(t.name || 'Unnamed transformation')}</div><div class="otr-id-line">${copyableId(t.transformation_id)}</div>${t.description ? `<div class="otr-description">${escapeHtml(t.description)}</div>` : ''}${admin ? `<div class="text-muted">${escapeHtml(owner)}</div>` : ''}${t.draft ? `<div class="text-muted">${escapeHtml(t.draft.status)}</div>` : ''}</td>
      <td class="otr-rule">${rule}</td><td>${target}</td><td>${t.failure_policy === 'continue' ? 'Continue' : 'Block output'}</td>
      <td><input type="checkbox" class="otr-enabled" ${t.enabled ? 'checked' : ''} ${canManage ? '' : 'disabled'} aria-label="Enabled"></td>
      <td class="otr-actions">${canManage ? `<a class="btn btn-secondary otr-btn-action" href="${prefix}/${encodeURIComponent(t.transformation_id)}/edit">Edit</a><button class="btn btn-secondary otr-btn-action otr-btn-danger" data-delete-transformation="${t.transformation_id}">Delete</button>` : options.detail ? 'Read only' : `<a class="btn btn-secondary otr-btn-action" href="${prefix}/${encodeURIComponent(t.transformation_id)}">View</a>`}</td></tr>`;
  }).join('');
  const drafts = (options.drafts ?? []).filter(t => t.draft?.status === 'PENDING').map(t => `<tr>
    <td>${escapeHtml(t.name || 'Unnamed draft')}<div class="otr-id-line">${copyableId(t.transformation_id)}</div></td>
    <td>${escapeHtml(options.agents?.find(a => a.id === t.draft?.agent_principal_id)?.name ?? t.draft?.agent_principal_id ?? '')}</td>
    <td>${escapeHtml(t.draft?.justification ?? '')}<pre class="otr-rule">${escapeHtml(JSON.stringify(t.rule, null, 2))}</pre></td>
    <td class="otr-actions">${canManage ? `<button class="btn btn-primary otr-btn-action" data-draft-id="${t.transformation_id}" data-resolve="approve">Approve</button><button class="btn btn-secondary otr-btn-action otr-btn-danger" data-draft-id="${t.transformation_id}" data-resolve="deny">Deny</button>` : 'Read only'}</td></tr>`).join('');
  const history = (options.drafts ?? []).filter(t => t.draft?.status !== 'PENDING').map(t => `<tr><td>${escapeHtml(t.name || 'Unnamed draft')}</td><td>${escapeHtml(t.draft?.status ?? '')}</td><td>${escapeHtml(t.draft?.denial_reason ?? '')}</td><td>${formatTimestamp(t.draft?.resolved_at ?? '')}</td></tr>`).join('');
  const data = JSON.stringify({ orgId: options.org_id ?? null, canManage, totpEnabled: options.totp_enabled ?? false, listPath: prefix, transformationId: record?.transformation_id ?? null, revision: record?.revision ?? 1 }).replace(/</g, '\\u003c');
  const banner = options.require_totp && !options.totp_enabled ? '<p class="alert alert-error">Set up two-factor authentication in your profile before deleting rules or resolving drafts.</p>' : '';
  const content = editing ? `
    <h2>${title}</h2>
    ${record ? `<p class="text-muted otr-scope-hint">${copyableId(record.transformation_id)} | Revision ${record.revision ?? 1}</p>` : ''}
    <form class="card otr-edit-card" id="otr-form">${editor(record)}
      <div class="otr-form-actions"><button class="btn btn-primary" type="submit">${options.create ? 'Create Transformation' : 'Save Changes'}</button><a class="btn btn-secondary" href="${prefix}">Cancel</a></div>
    </form>` : `
    <div class="page-header flex-between"><h2>Output Transformations${infoIcon('transformations-info', INFO_OUTPUT_TRANSFORMATIONS)}</h2>
      ${canManage && !options.detail ? `<a href="${prefix}/create" class="btn btn-primary otr-create-link"><span class="material-symbols-outlined otr-btn-icon" aria-hidden="true">add</span>Create Transformation</a>` : ''}
    </div>
    ${options.detail ? `<p><a href="${prefix}">All transformations</a></p>` : ''}
    ${admin ? '<p class="text-muted">Read-only view across owners. Make changes in the owning personal or organization workspace.</p>' : !canManage ? '<p class="text-muted">Your organization role allows viewing. An organization admin can make changes.</p>' : ''}
    ${banner}
    <div class="card otr-card-flush otr-scroll"><table><thead><tr>${canManage ? '<th class="otr-drag-cell"></th>' : ''}<th>Name</th><th>Rule</th><th>Applies to</th><th>On failure</th><th>Enabled</th><th>Actions</th></tr></thead><tbody id="otr-rows">${rows || `<tr><td colspan="${canManage ? 7 : 6}" class="otr-empty-cell">No transformations configured.</td></tr>`}</tbody></table></div>
    ${!admin && !options.detail ? `<div class="card otr-card-flush"><h3 class="otr-card-heading">Pending drafts${infoIcon('transformation-drafts-info', INFO_TRANSFORMATION_DRAFTS)}</h3><p class="otr-section-desc">Your agents can propose new transformations. Review and approve or deny them here.</p><div class="otr-scroll"><table><thead><tr><th>Name</th><th>Suggested by</th><th>Justification and rule</th><th>Actions</th></tr></thead><tbody>${drafts || '<tr><td colspan="4" class="otr-empty-cell">No pending drafts.</td></tr>'}</tbody></table></div></div>` : ''}
    ${!admin && !options.detail && history ? `<div class="card otr-card-flush"><h3 class="otr-card-heading">Resolved drafts</h3><div class="otr-scroll"><table><thead><tr><th>Name</th><th>Status</th><th>Reason</th><th>Resolved</th></tr></thead><tbody>${history}</tbody></table></div></div>` : ''}`;
  return renderPage(title, `${content}<script>window.__PAGE_DATA__ = ${data};</script>${assetTags('pages/owner-transformations/client.ts')}`, prefix, admin ? 'admin' : 'owner', renderOptions);
}
