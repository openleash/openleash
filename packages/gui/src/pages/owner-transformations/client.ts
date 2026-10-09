import './style.css';
import { olToast, olConfirm, olPrompt, ol2FA, olApiError } from '../../shared/common';

interface OwnerTransformationsPageData { orgId: string | null; canManage: boolean; totpEnabled: boolean }
declare global { interface Window { __PAGE_DATA__: OwnerTransformationsPageData } }
const { orgId, canManage, totpEnabled } = window.__PAGE_DATA__;
const base = orgId ? '/v1/owner/organizations/' + encodeURIComponent(orgId) : '/v1/owner';
function field(root: Element, name: string) { return (root.querySelector('[data-field="' + name + '"]') as HTMLInputElement).value; }
function rule(root: Element) {
  if (field(root, 'type') === 'regex_replace') return { type: 'regex_replace', from_pattern: field(root, 'from_pattern'), to_pattern: field(root, 'to_pattern') };
  const chars = field(root, 'max_characters'), lines = field(root, 'max_lines');
  if (!chars && !lines) throw new Error('Set a character or line limit');
  for (const value of [chars, lines]) if (value && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 1048576)) throw new Error('Limits must be whole numbers from 1 to 1048576');
  return { type: 'cap_output_length', max_characters: chars ? Number(chars) : null, max_lines: lines ? Number(lines) : null };
}
function body(root: Element) {
  const target = field(root, 'target');
  return { name: field(root, 'name') || null, description: field(root, 'description') || null,
    applies_to_agent_principal_id: target.startsWith('agent:') ? target.slice(6) : null,
    applies_to_group_id: target.startsWith('group:') ? target.slice(6) : null,
    failure_policy: field(root, 'failure_policy'), rule: rule(root) };
}
async function api(path: string, method: string, payload?: unknown) {
  const response = await fetch(base + path, { method, headers: payload ? { 'Content-Type': 'application/json' } : {}, body: payload ? JSON.stringify(payload) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(olApiError(result, 'Request failed'));
  return result;
}
async function protectedAction(path: string, method: string, payload: Record<string, unknown> = {}) {
  if (totpEnabled) {
    return ol2FA(async code => {
      try { await api(path, method, { ...payload, totp_code: code }); return null; }
      catch (e) { return (e as Error).message; }
    });
  }
  await api(path, method, payload); return true;
}
async function action(target: HTMLElement) {
  const row = target.closest<HTMLElement>('.otr-row');
  const id = row?.dataset.transformationId;
  if (target.id === 'otr-create-btn') { await api('/transformations', 'POST', body(target.closest('details')!)); window.location.reload(); }
  else if (target.hasAttribute('data-save-transformation')) {
    const result = await api('/transformations/' + id, 'PUT', { ...body(row!), revision: Number(row!.dataset.revision) });
    row!.dataset.revision = String(result.revision); window.location.reload();
  } else if (target.hasAttribute('data-delete-transformation')) {
    if (await olConfirm('Delete this transformation?', 'Delete transformation')) {
      if (await protectedAction('/transformations/' + id, 'DELETE')) window.location.href = window.location.pathname.replace(/\/[0-9a-f-]{36}$/, '');
    }
  } else if (target.hasAttribute('data-move')) {
    const rows = [...document.querySelectorAll<HTMLElement>('.otr-row')];
    const ids = rows.map(r => r.dataset.transformationId!);
    const i = ids.indexOf(id!), j = i + Number(target.dataset.move);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api('/transformations/order', 'PUT', { ordered_transformation_ids: ids }); window.location.reload();
  } else if (target.hasAttribute('data-preview')) {
    const output = document.getElementById('otr-preview-output') as HTMLTextAreaElement;
    output.value = '';
    const result = await api('/transformations/preview', 'POST', { rule: rule(row ?? target.closest('details')!), input: (document.getElementById('otr-sample') as HTMLTextAreaElement).value });
    output.value = result.output;
    document.getElementById('otr-preview-status')!.textContent = result.modified ? 'Output changed.' : 'No change.';
  } else if (target.dataset.resolve) {
    const reason = target.dataset.resolve === 'deny' ? await olPrompt('Reason for denial (optional)', 'Reason', 'Deny proposal') : '';
    if (reason === null) return;
    if (await protectedAction('/transformation-drafts/' + target.dataset.draftId + '/' + target.dataset.resolve, 'POST', { reason })) window.location.reload();
  }
}
if (canManage) {
  document.addEventListener('click', async e => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled || !(target.id === 'otr-create-btn' || ['data-save-transformation', 'data-delete-transformation', 'data-move', 'data-preview', 'data-resolve'].some(a => target.hasAttribute(a)))) return;
    target.disabled = true;
    try { await action(target); } catch (error) { olToast((error as Error).message, 'error'); }
    finally { target.disabled = false; }
  });
  document.addEventListener('change', async e => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.field === 'type') {
      const editor = input.closest('.otr-editor')!;
      editor.querySelector('.otr-cap')!.classList.toggle('hidden', input.value !== 'cap_output_length');
      editor.querySelector('.otr-regex')!.classList.toggle('hidden', input.value !== 'regex_replace');
    }
    if (input.classList.contains('otr-enabled')) {
      const row = input.closest<HTMLElement>('.otr-row')!;
      input.disabled = true;
      try {
        const result = await api('/transformations/' + row.dataset.transformationId, 'PUT', { enabled: input.checked, revision: Number(row.dataset.revision) });
        row.dataset.revision = String(result.revision); olToast('Saved', 'success');
      } catch (error) { input.checked = !input.checked; olToast((error as Error).message, 'error'); }
      finally { input.disabled = false; }
    }
  });
}
