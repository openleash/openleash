import './style.css';
import { olToast, olConfirm, olPrompt, ol2FA, olApiError } from '../../shared/common';

interface OwnerTransformationsPageData {
  orgId: string | null;
  canManage: boolean;
  totpEnabled: boolean;
  listPath: string;
  transformationId: string | null;
  revision: number;
}
declare global { interface Window { __PAGE_DATA__: OwnerTransformationsPageData } }
const { orgId, canManage, totpEnabled, listPath, transformationId, revision } = window.__PAGE_DATA__;
const base = orgId ? '/v1/owner/organizations/' + encodeURIComponent(orgId) : '/v1/owner';
let reordering = false;
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
  if (target.hasAttribute('data-delete-transformation')) {
    if (await olConfirm('Delete this transformation?', 'Delete transformation')) {
      if (await protectedAction('/transformations/' + target.dataset.deleteTransformation, 'DELETE')) window.location.href = listPath;
    }
  } else if (target.dataset.resolve) {
    const reason = target.dataset.resolve === 'deny' ? await olPrompt('Reason for denial (optional)', 'Reason', 'Deny draft') : '';
    if (reason === null) return;
    if (await protectedAction('/transformation-drafts/' + target.dataset.draftId + '/' + target.dataset.resolve, 'POST', { reason })) window.location.reload();
  }
}

const rows = () => [...document.querySelectorAll<HTMLTableRowElement>('#otr-rows .otr-row')];
let dragRow: HTMLTableRowElement | null = null;
let dragSnapshot: HTMLTableRowElement[] = [];
function clearDrag() {
  document.querySelectorAll('.otr-row-dragging, .otr-drop-before, .otr-drop-after').forEach(row => row.classList.remove('otr-row-dragging', 'otr-drop-before', 'otr-drop-after'));
  dragRow = null;
  dragSnapshot = [];
}
function dropAfter(event: DragEvent, row: HTMLTableRowElement) {
  const rect = row.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}
async function saveOrder(snapshot: HTMLTableRowElement[]) {
  const current = rows();
  if (current.every((row, i) => row === snapshot[i])) return;
  reordering = true;
  const tbody = document.getElementById('otr-rows')!;
  const controls = [...tbody.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')].map(control => ({ control, disabled: control.disabled }));
  controls.forEach(({ control }) => { control.disabled = true; });
  tbody.setAttribute('aria-busy', 'true');
  try {
    await api('/transformations/order', 'PUT', { ordered_transformation_ids: current.map(row => row.dataset.transformationId!) });
    // Reordering increments every revision; reload before any further edits.
    window.location.reload();
  } catch (error) {
    snapshot.forEach(row => tbody.appendChild(row));
    controls.forEach(({ control, disabled }) => { control.disabled = disabled; });
    reordering = false;
    tbody.removeAttribute('aria-busy');
    olToast((error as Error).message, 'error');
  }
}

if (canManage) {
  document.getElementById('otr-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const payload = body(form);
      if (transformationId) await api('/transformations/' + transformationId, 'PUT', { ...payload, revision });
      else await api('/transformations', 'POST', payload);
      window.location.href = listPath;
    } catch (error) {
      olToast((error as Error).message, 'error');
      submit.disabled = false;
    }
  });
  document.addEventListener('click', async e => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled || reordering || !['data-delete-transformation', 'data-resolve'].some(a => target.hasAttribute(a))) return;
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
      if (reordering) { input.checked = !input.checked; return; }
      const row = input.closest<HTMLElement>('.otr-row')!;
      input.disabled = true;
      try {
        const result = await api('/transformations/' + row.dataset.transformationId, 'PUT', { enabled: input.checked, revision: Number(row.dataset.revision) });
        row.dataset.revision = String(result.revision); olToast('Saved', 'success');
      } catch (error) { input.checked = !input.checked; olToast((error as Error).message, 'error'); }
      finally { input.disabled = false; }
    }
  });
  document.addEventListener('dragstart', e => {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLTableRowElement>('#otr-rows .otr-row');
    if (!row) return;
    if (reordering || document.querySelector('#otr-rows .otr-enabled:disabled') || (target.closest('a, input, button') && !target.closest('.otr-drag-handle'))) { e.preventDefault(); return; }
    dragRow = row;
    dragSnapshot = rows();
    row.classList.add('otr-row-dragging');
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.transformationId!); }
  });
  document.addEventListener('dragend', clearDrag);
  document.addEventListener('dragover', e => {
    if (!dragRow) return;
    const target = (e.target as HTMLElement).closest<HTMLTableRowElement>('#otr-rows .otr-row');
    if (!target || target === dragRow) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.otr-drop-before, .otr-drop-after').forEach(row => row.classList.remove('otr-drop-before', 'otr-drop-after'));
    target.classList.add(dropAfter(e, target) ? 'otr-drop-after' : 'otr-drop-before');
  });
  document.addEventListener('drop', async e => {
    if (!dragRow) return;
    const target = (e.target as HTMLElement).closest<HTMLTableRowElement>('#otr-rows .otr-row');
    if (!target || target === dragRow) return;
    e.preventDefault();
    const snapshot = dragSnapshot;
    target.parentElement!.insertBefore(dragRow, dropAfter(e, target) ? target.nextSibling : target);
    clearDrag();
    await saveOrder(snapshot);
  });
  document.addEventListener('keydown', async e => {
    if (reordering || document.querySelector('#otr-rows .otr-enabled:disabled') || !['ArrowUp', 'ArrowDown'].includes(e.key) || !(e.target as HTMLElement).closest('.otr-drag-handle')) return;
    e.preventDefault();
    const row = (e.target as HTMLElement).closest<HTMLTableRowElement>('.otr-row')!;
    const snapshot = rows(), index = snapshot.indexOf(row);
    const target = snapshot[index + (e.key === 'ArrowUp' ? -1 : 1)];
    if (!target) return;
    row.parentElement!.insertBefore(row, e.key === 'ArrowUp' ? target : target.nextSibling);
    await saveOrder(snapshot);
  });
}
