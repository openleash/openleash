import { afterEach, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { getTransformations, reportTransformationResults, createTransformationDraft, listTransformationDrafts } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());
it('signs every transformation request and preserves snapshot metadata', async () => {
  const key = crypto.generateKeyPairSync('ed25519');
  const params = { openleashUrl: 'http://example.test/', agentId: 'agent', privateKeyB64: key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
  const calls: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const headers = init.headers as Record<string, string>;
    const body = init.body?.toString() ?? '{}';
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    expect(headers['X-Agent-Id']).toBe('agent');
    expect(headers['X-Body-Sha256']).toBe(hash);
    expect(crypto.verify(null, Buffer.from([init.method, path, headers['X-Timestamp'], headers['X-Nonce'], hash].join('\n')), key.publicKey, Buffer.from(headers['X-Signature'], 'base64'))).toBe(true);
    calls.push({ path, init });
    return new Response(JSON.stringify({ protocol_version: 1, report_token: 'snapshot', transformations: [] }));
  }));
  const plan = await getTransformations(params);
  await reportTransformationResults({ ...params, report: { report_token: plan.report_token, tool_call_id: crypto.randomUUID(), outcome: 'completed', results: [] } });
  await createTransformationDraft({ ...params, rule: { type: 'cap_output_length', max_lines: 1 }, justification: 'Limit output' });
  await listTransformationDrafts(params);
  expect(calls.map(c => c.path)).toEqual(['/v1/agent/transformations', '/v1/agent/transformation-results', '/v1/agent/transformation-drafts', '/v1/agent/transformation-drafts']);
  expect(JSON.parse(String(calls[2].init.body)).justification).toBe('Limit output');
});
it('propagates HTTP errors instead of returning an empty chain', async () => {
  const key = crypto.generateKeyPairSync('ed25519');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 503 })));
  await expect(getTransformations({ openleashUrl: 'http://example.test', agentId: 'agent', privateKeyB64: key.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') })).rejects.toThrow('503');
});
