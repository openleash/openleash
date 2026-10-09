import { afterEach, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { getTransformations, reportTransformationResults, createTransformationDraft, listTransformationDrafts, getTransformationDraft } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());
it('signs every transformation request and preserves snapshot metadata', async () => {
  const key = crypto.generateKeyPairSync('ed25519');
  const params = { openleashUrl: 'http://example.test/', agentId: 'agent', privateKeyB64: key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
  const calls: { path: string; init: RequestInit }[] = [];
  const draft = { transformation_draft_id: crypto.randomUUID(), status: 'PENDING', created_at: new Date().toISOString(), resulting_transformation_id: null, resolved_at: null, denial_reason: null };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    const headers = init.headers as Record<string, string>;
    const body = init.body?.toString() ?? '{}';
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    expect(headers['X-Agent-Id']).toBe('agent');
    expect(headers['X-Body-Sha256']).toBe(hash);
    expect(crypto.verify(null, Buffer.from([init.method, parsed.pathname, headers['X-Timestamp'], headers['X-Nonce'], hash].join('\n')), key.publicKey, Buffer.from(headers['X-Signature'], 'base64'))).toBe(true);
    calls.push({ path, init });
    const bodyResponse = parsed.pathname.endsWith('/transformation-drafts')
      ? init.method === 'POST' ? draft : { transformation_drafts: [draft] }
      : parsed.pathname.includes('/transformation-drafts/') ? draft
        : { protocol_version: 1, report_token: 'snapshot', transformations: [] };
    return new Response(JSON.stringify(bodyResponse));
  }));
  const plan = await getTransformations(params);
  await reportTransformationResults({ ...params, report: { report_token: plan.report_token, tool_call_id: crypto.randomUUID(), outcome: 'completed', results: [] } });
  expect((await createTransformationDraft({ ...params, rule: { type: 'cap_output_length', max_lines: 1 }, justification: 'Limit output' })).transformation_draft_id).toBe(draft.transformation_draft_id);
  expect((await listTransformationDrafts(params)).transformation_drafts).toEqual([draft]);
  expect((await listTransformationDrafts({ ...params, status: 'PENDING' })).transformation_drafts[0].status).toBe('PENDING');
  expect(await getTransformationDraft({ ...params, transformationDraftId: draft.transformation_draft_id })).toEqual(draft);
  expect(calls.map(c => c.path)).toEqual(['/v1/agent/transformations', '/v1/agent/transformation-results', '/v1/agent/transformation-drafts', '/v1/agent/transformation-drafts', '/v1/agent/transformation-drafts?status=PENDING', '/v1/agent/transformation-drafts/' + draft.transformation_draft_id]);
  expect(JSON.parse(String(calls[2].init.body)).justification).toBe('Limit output');
});
it('propagates HTTP errors instead of returning an empty chain', async () => {
  const key = crypto.generateKeyPairSync('ed25519');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 503 })));
  await expect(getTransformations({ openleashUrl: 'http://example.test', agentId: 'agent', privateKeyB64: key.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') })).rejects.toThrow('503');
});
