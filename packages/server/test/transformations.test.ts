import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createFileDataStore, signRequest, generateBackupCodes, type DataStore, type StateAgentEntry } from '@openleash/core';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { bootstrapState } from '../src/bootstrap.js';
import { cascadeDeleteUser, cascadeDeleteAgent } from '../src/cascade.js';

let root: string, app: FastifyInstance, store: DataStore, ownerId: string, otherId: string, ownerToken: string, otherToken: string, orgId: string;
let personal: StateAgentEntry, orgAgent: StateAgentEntry;
const keys = crypto.generateKeyPairSync('ed25519');
const privateKeyB64 = keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const publicKeyB64 = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const cap = { type: 'cap_output_length', max_characters: 20 };
const base = '/v1/owner/transformations';
const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, token = ownerToken) => app.inject({ method, url, headers: { authorization: 'Bearer ' + token }, ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: '203.0.113.7' });
async function create(payload: object = { rule: cap }, prefix = base) {
  const result = await req('POST', prefix, payload);
  expect(result.statusCode, result.body).toBe(200);
  return result.json().transformation_id as string;
}
function makeAgent(owner_type: 'user' | 'org', owner_id: string) {
  const id = crypto.randomUUID(), agent_id = 'agent-' + id;
  store.agents.write({ agent_principal_id: id, agent_id, owner_type, owner_id, public_key_b64: publicKeyB64, status: 'ACTIVE', attributes: {}, created_at: new Date().toISOString(), revoked_at: null, webhook_url: '', webhook_secret: '', webhook_auth_token: '' });
  const entry = { agent_principal_id: id, agent_id, owner_type, owner_id, path: './agents/' + id + '.md' };
  store.state.updateState(s => { s.agents.push(entry); });
  return entry;
}
async function signed(method: 'GET' | 'POST', url: string, entry = personal, payload: unknown = {}) {
  const headers = signRequest({ method, path: url.split('?')[0], timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), bodyBytes: Buffer.from(JSON.stringify(payload)), privateKeyB64 });
  return app.inject({ method, url, headers: { ...headers, 'x-agent-id': entry.agent_id, 'content-type': 'application/json' }, ...(method === 'POST' ? { payload: payload as object } : {}) });
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'transformations-test-'));
  bootstrapState(root); store = createFileDataStore(path.join(root, 'data')); store.initialize();
  ({ app } = await createServer({ config: loadConfig(root), dataDir: path.join(root, 'data'), store }));
  app.log.level = 'silent'; await app.ready();
  const setup = await app.inject({ method: 'POST', url: '/v1/initial-setup', payload: { display_name: 'Owner', passphrase: 'test-passphrase' } });
  ownerId = setup.json().user_principal_id;
  ownerToken = (await app.inject({ method: 'POST', url: '/v1/owner/login', payload: { user_principal_id: ownerId, passphrase: 'test-passphrase' } })).json().token;
  otherId = crypto.randomUUID();
  store.users.write({ ...store.users.read(ownerId), user_principal_id: otherId, display_name: 'Other', system_roles: [] });
  store.state.updateState(s => { s.users.push({ user_principal_id: otherId, path: './users/' + otherId + '.md' }); });
  otherToken = (await app.inject({ method: 'POST', url: '/v1/owner/login', payload: { user_principal_id: otherId, passphrase: 'test-passphrase' } })).json().token;
  orgId = (await req('POST', '/v1/owner/organizations', { display_name: 'Review org', slug: 'review-org' })).json().org_id;
  personal = makeAgent('user', ownerId); orgAgent = makeAgent('org', orgId);
});
afterEach(async () => { await app.close(); fs.rmSync(root, { recursive: true, force: true }); });

describe('transformation management and enforcement contract', () => {
  it('rejects malformed, empty, unsafe and unknown rule fields before saving', async () => {
    for (const rule of [{ type: 'cap_output_length' }, { type: 'cap_output_length', max_lines: 0 }, { type: 'regex_replace', from_pattern: '[', to_pattern: '' }, { type: 'regex_replace', from_pattern: '(?<=secret)x', to_pattern: '' }, { type: 'regex_replace', from_pattern: 'a*', to_pattern: '' }]) {
      expect((await req('POST', base, { rule })).statusCode).toBe(400);
    }
    const id = await create();
    expect((await req('PUT', base + '/' + id, { rank: 20 })).statusCode).toBe(400);
  });
  it('edits all authoring fields, rejects stale saves and isolates owners', async () => {
    const id = await create();
    const saved = await req('PUT', base + '/' + id, { revision: 1, name: 'Private', description: 'Purpose', failure_policy: 'continue', applies_to_agent_principal_id: personal.agent_principal_id });
    expect(saved.json().revision).toBe(2);
    expect((await req('PUT', base + '/' + id, { revision: 1, enabled: false })).statusCode).toBe(409);
    expect((await req('GET', base + '/' + id, undefined, otherToken)).statusCode).toBe(404);
    expect((await req('DELETE', base + '/' + id, undefined, otherToken)).statusCode).toBe(404);
    expect((await req('POST', base, { rule: cap, applies_to_agent_principal_id: orgAgent.agent_principal_id })).statusCode).toBe(400);
    expect((await req('GET', base + '/' + id)).json()).toMatchObject({ name: 'Private', description: 'Purpose', failure_policy: 'continue' });
  });
  it('enforces organization membership and viewer/admin permissions', async () => {
    const prefix = '/v1/owner/organizations/' + orgId + '/transformations';
    const id = await create({ rule: cap, name: 'Org rule' }, prefix);
    expect((await req('GET', prefix, undefined, otherToken)).statusCode).toBe(403);
    const membership_id = crypto.randomUUID();
    store.memberships.write({ membership_id, org_id: orgId, user_principal_id: otherId, role: 'org_viewer', status: 'active', created_at: new Date().toISOString(), invited_by_user_id: ownerId });
    expect((await req('GET', prefix, undefined, otherToken)).json().transformations[0].name).toBe('Org rule');
    expect((await req('PUT', prefix + '/' + id, { enabled: false }, otherToken)).statusCode).toBe(403);
    expect((await req('GET', base + '/' + id)).statusCode).toBe(404);
    expect((await signed('GET', '/v1/agent/transformations')).json().transformations).toHaveLength(0);
    expect((await signed('GET', '/v1/agent/transformations', orgAgent)).json().transformations).toHaveLength(1);
  });
  it('resolves groups and agent targeting, orders the whole chain, and skips disabled rules', async () => {
    const prefix = '/v1/owner/organizations/' + orgId;
    const group = await req('POST', prefix + '/policy-groups', { name: 'Team', slug: 'team' });
    expect(group.statusCode, group.body).toBe(200);
    const gid = group.json().group_id;
    await req('POST', prefix + '/policy-groups/' + gid + '/agents/' + orgAgent.agent_principal_id);
    const all = await create({ rule: cap }, prefix + '/transformations');
    const grouped = await create({ rule: cap, applies_to_group_id: gid }, prefix + '/transformations');
    const specific = await create({ rule: cap, applies_to_agent_principal_id: orgAgent.agent_principal_id }, prefix + '/transformations');
    expect((await req('PUT', prefix + '/transformations/order', { ordered_transformation_ids: [all, all, grouped] })).statusCode).toBe(409);
    expect((await req('PUT', prefix + '/transformations/order', { ordered_transformation_ids: [specific, grouped, all] })).statusCode).toBe(200);
    const plan = (await signed('GET', '/v1/agent/transformations', orgAgent)).json();
    expect(plan.transformations.map((t: { transformation_id: string }) => t.transformation_id)).toEqual([specific, grouped, all]);
    await req('PUT', prefix + '/transformations/' + grouped, { enabled: false });
    expect((await signed('GET', '/v1/agent/transformations', orgAgent)).json().transformations).toHaveLength(2);
    expect((await req('DELETE', prefix + '/policy-groups/' + gid)).statusCode).toBe(409);
  });
  it('requires 2FA on deletion and consumes backup codes', async () => {
    const id = await create(); const backup = generateBackupCodes();
    store.users.write({ ...store.users.read(ownerId), totp_enabled: true, totp_backup_codes_hash: backup.hashes });
    expect((await req('DELETE', base + '/' + id)).json().error.code).toBe('TOTP_REQUIRED');
    expect((await req('DELETE', base + '/' + id, { totp_code: 'wrong' })).statusCode).toBe(403);
    expect((await req('DELETE', base + '/' + id, { totp_code: backup.codes[0] })).statusCode).toBe(200);
    expect(store.users.read(ownerId).totp_backup_codes_hash).toHaveLength(backup.codes.length - 1);
  });
  it('exposes read-only admin list/detail and denies ordinary owners', async () => {
    const id = await create();
    expect((await req('GET', '/v1/admin/transformations')).json().transformations).toHaveLength(1);
    expect((await req('GET', '/v1/admin/transformations/' + id)).json().transformation_id).toBe(id);
    expect((await req('GET', '/v1/admin/transformations', undefined, otherToken)).statusCode).toBe(403);
    expect((await req('PUT', '/v1/admin/transformations/' + id, { enabled: false })).statusCode).toBe(404);
  });
  it('keeps agent proposals inactive until owner approval and prevents double resolution', async () => {
    const draft = await signed('POST', '/v1/agent/transformation-drafts', personal, { rule: cap, justification: 'Avoid oversized output', name: 'Proposed cap' });
    expect(draft.statusCode, draft.body).toBe(200); const id = draft.json().transformation_draft_id;
    expect(draft.json()).toEqual({ transformation_draft_id: id, status: 'PENDING', created_at: expect.any(String) });
    expect((await signed('GET', '/v1/agent/transformations')).json().transformations).toHaveLength(0);
    expect((await req('GET', '/v1/owner/transformation-drafts')).json().transformation_drafts).toHaveLength(1);
    expect((await req('POST', '/v1/owner/transformation-drafts/' + id + '/approve', {}, otherToken)).statusCode).toBe(404);
    expect((await req('POST', '/v1/owner/transformation-drafts/' + id + '/approve')).json()).toEqual({ transformation_draft_id: id, status: 'APPROVED', resulting_transformation_id: id });
    expect((await signed('GET', '/v1/agent/transformations')).json().transformations[0]).toMatchObject({ transformation_id: id, failure_policy: 'block', revision: 2 });
    expect((await req('POST', '/v1/owner/transformation-drafts/' + id + '/deny', {})).statusCode).toBe(400);
  });
  it('records signed runtime evidence for fetched revisions without accepting raw output or forged plans', async () => {
    const id = await create(); const plan = (await signed('GET', '/v1/agent/transformations')).json();
    await req('PUT', base + '/' + id, { rule: { type: 'cap_output_length', max_characters: 10 } });
    const body = { report_token: plan.report_token, action_id: crypto.randomUUID(), tool_call_id: crypto.randomUUID(), outcome: 'completed', results: [{ transformation_id: id, revision: 1, status: 'applied', chars_before: 40, chars_after: 20 }] };
    expect((await signed('POST', '/v1/agent/transformation-results', personal, body)).statusCode).toBe(200);
    expect((await signed('POST', '/v1/agent/transformation-results', personal, { ...body, raw_output: 'secret' })).statusCode).toBe(400);
    expect((await signed('POST', '/v1/agent/transformation-results', personal, { ...body, report_token: 'fake' })).statusCode).toBe(400);
    expect((await signed('POST', '/v1/agent/transformation-results', orgAgent, body)).statusCode).toBe(400);
    expect((await signed('POST', '/v1/agent/transformation-results', personal, { ...body, results: [] })).statusCode).toBe(400);
    const events = store.audit.readPage(100, 0).items.filter(e => e.event_type === 'TRANSFORMATION_EXECUTION_REPORTED');
    expect(events).toHaveLength(1); expect(events[0].metadata_json).toMatchObject({ owner_id: ownerId, evidence: 'runtime_reported', results: body.results });
    expect(events[0].action_id).toBe(body.action_id);
    expect(events[0].principal_id).toBe(personal.agent_principal_id);
  });
  it('requires 2FA for proposal review and retains denial history without activating rules', async () => {
    const id = (await signed('POST', '/v1/agent/transformation-drafts', personal, { rule: cap, justification: 'Cap output' })).json().transformation_draft_id;
    const backup = generateBackupCodes();
    store.users.write({ ...store.users.read(ownerId), totp_enabled: true, totp_backup_codes_hash: backup.hashes });
    expect((await req('POST', '/v1/owner/transformation-drafts/' + id + '/deny', {})).json().error.code).toBe('TOTP_REQUIRED');
    expect((await req('POST', '/v1/owner/transformation-drafts/' + id + '/deny', { totp_code: backup.codes[0], reason: 'Use a smaller cap' })).json()).toEqual({ transformation_draft_id: id, status: 'DENIED' });
    expect((await signed('GET', '/v1/agent/transformation-drafts')).json().transformation_drafts[0]).toMatchObject({ status: 'DENIED', denial_reason: 'Use a smaller cap', resulting_transformation_id: null });
    expect((await signed('GET', '/v1/agent/transformations')).json().transformations).toHaveLength(0);
    expect((await signed('GET', '/v1/agent/transformation-drafts', orgAgent)).json().transformation_drafts).toHaveLength(0);
  });
  it('filters and retrieves flat draft views without exposing another agent or owner drafts', async () => {
    const draftBase = '/v1/agent/transformation-drafts';
    const ownerBase = '/v1/owner/transformation-drafts';
    const ids: string[] = [];
    for (const name of ['Approved cap', 'Denied cap', 'Pending cap']) {
      ids.push((await signed('POST', draftBase, personal, { rule: cap, justification: 'Limit output', name })).json().transformation_draft_id);
    }
    await req('POST', ownerBase + '/' + ids[0] + '/approve');
    await req('POST', ownerBase + '/' + ids[1] + '/deny', { reason: 'Too broad' });
    for (const [index, status] of ['APPROVED', 'DENIED', 'PENDING'].entries()) {
      for (const response of [await signed('GET', draftBase + '?status=' + status), await req('GET', ownerBase + '?status=' + status)]) {
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json()).toEqual({ transformation_drafts: [expect.objectContaining({ transformation_draft_id: ids[index], status })] });
      }
    }
    expect((await signed('GET', draftBase)).json().transformation_drafts).toHaveLength(3);
    const approved = (await signed('GET', draftBase + '/' + ids[0])).json();
    expect(approved).toEqual({
      transformation_draft_id: ids[0], status: 'APPROVED', name: 'Approved cap', description: null,
      rule: cap, applies_to_agent_principal_id: personal.agent_principal_id, justification: 'Limit output',
      resulting_transformation_id: ids[0], created_at: expect.any(String), resolved_at: expect.any(String), denial_reason: null,
    });
    const ownerView = (await req('GET', ownerBase + '/' + ids[0])).json();
    expect(ownerView).toEqual({ ...approved, agent_principal_id: personal.agent_principal_id, agent_id: personal.agent_id, owner_type: 'user', owner_id: ownerId, resolved_by: ownerId });
    const pending = (await signed('GET', draftBase + '/' + ids[2])).json();
    expect(pending).toMatchObject({ status: 'PENDING', resulting_transformation_id: null, resolved_at: null, denial_reason: null });
    const otherAgent = makeAgent('user', ownerId);
    expect((await signed('GET', draftBase + '/' + ids[0], otherAgent)).statusCode).toBe(404);
    expect((await signed('GET', draftBase, otherAgent)).json()).toEqual({ transformation_drafts: [] });
    expect((await signed('GET', draftBase + '/' + ids[0], orgAgent)).statusCode).toBe(404);
    expect((await req('GET', ownerBase + '/' + ids[0], undefined, otherToken)).statusCode).toBe(404);
    expect((await req('GET', ownerBase, undefined, otherToken)).json()).toEqual({ transformation_drafts: [] });
    for (const id of [await create(), crypto.randomUUID(), 'invalid']) {
      expect((await req('GET', ownerBase + '/' + id)).statusCode).toBe(404);
      expect((await signed('GET', draftBase + '/' + id)).statusCode).toBe(404);
    }
  });
  it('supports organization draft lookup and filtering with membership and review permissions', async () => {
    const id = (await signed('POST', '/v1/agent/transformation-drafts', orgAgent, { rule: cap, justification: 'Org output cap' })).json().transformation_draft_id;
    const url = '/v1/owner/organizations/' + orgId + '/transformation-drafts';
    expect((await req('GET', url + '?status=PENDING')).json().transformation_drafts).toEqual([expect.objectContaining({ transformation_draft_id: id, status: 'PENDING', agent_id: orgAgent.agent_id })]);
    expect((await req('GET', url + '/' + id, undefined, otherToken)).statusCode).toBe(403);
    expect((await req('GET', '/v1/owner/transformation-drafts/' + id)).statusCode).toBe(404);
    const membership_id = crypto.randomUUID();
    store.memberships.write({ membership_id, org_id: orgId, user_principal_id: otherId, role: 'org_viewer', status: 'active', created_at: new Date().toISOString(), invited_by_user_id: ownerId });
    expect((await req('GET', url + '/' + id, undefined, otherToken)).statusCode).toBe(200);
    expect((await req('POST', url + '/' + id + '/approve', {}, otherToken)).statusCode).toBe(403);
    expect((await req('POST', url + '/' + id + '/approve')).json()).toEqual({ transformation_draft_id: id, status: 'APPROVED', resulting_transformation_id: id });
    expect((await req('GET', url + '?status=PENDING')).json()).toEqual({ transformation_drafts: [] });
    expect((await signed('GET', '/v1/agent/transformation-drafts/' + id, orgAgent)).json().resulting_transformation_id).toBe(id);
    // Older records have no stored agent label or reviewer ID.
    const record = store.transformations.read(id);
    delete record.draft!.agent_id; delete record.draft!.resolved_by;
    store.transformations.write(record);
    expect((await req('GET', url + '/' + id)).json()).toMatchObject({ agent_id: orgAgent.agent_id, resolved_by: null });
  });
  it('previews literal replacements, hard caps, and terminates pathological regexes', async () => {
    const response = await req('POST', base + '/preview', { rule: { type: 'regex_replace', from_pattern: 'x', to_pattern: '$1\\1' }, input: 'x' });
    expect(response.json().output).toBe('$1\\1');
    expect((await req('POST', base + '/preview', { rule: cap, input: 'x'.repeat(40) })).json().output).toHaveLength(20);
    expect((await req('POST', base + '/preview', { rule: { type: 'regex_replace', from_pattern: '(a+)+$', to_pattern: '' }, input: 'a'.repeat(100) + '!' })).statusCode).toBe(422);
  });
  it('cascades targeted and owner transformations and rejects transfer until retargeted', async () => {
    const targeted = await create({ rule: cap, applies_to_agent_principal_id: personal.agent_principal_id });
    expect((await req('POST', '/v1/owner/agents/' + personal.agent_principal_id + '/transfer', { target_org_id: orgId })).statusCode).toBe(409);
    cascadeDeleteAgent(store, personal.agent_principal_id);
    expect(() => store.transformations.read(targeted)).toThrow();
    await create(); cascadeDeleteUser(store, ownerId);
    expect(store.transformations.listByOwner('user', ownerId)).toEqual([]);
    expect(store.state.getState().transformations).toEqual([]);
  });
  it('lists explicit provisioner bindings and matches policy bind/unbind behavior', async () => {
    const second = makeAgent('user', ownerId);
    const id = await create({ rule: cap, applies_to_agent_principal_id: second.agent_principal_id });
    const provisioner = (await req('POST', '/v1/owner/provisioners', { name: 'Runtime' })).json();
    expect((await req('GET', '/v1/provisioner/transformations', undefined, provisioner.token)).json().transformations).toHaveLength(1);
    const url = '/v1/provisioner/agents/' + personal.agent_principal_id + '/transformations';
    const ids = { transformation_id: id, agent_principal_id: personal.agent_principal_id };
    expect((await req('GET', url, undefined, provisioner.token)).json()).toEqual({ agent_principal_id: personal.agent_principal_id, transformations: [], groups: [] });
    expect((await req('POST', url, { transformation_id: id }, provisioner.token)).json()).toEqual({ ...ids, status: 'bound' });
    expect((await req('POST', url, { transformation_id: id }, provisioner.token)).json()).toEqual({ ...ids, status: 'already_bound' });
    expect(store.state.getState().transformation_bindings).toHaveLength(1);
    expect((await req('GET', url, undefined, provisioner.token)).json()).toEqual({ agent_principal_id: personal.agent_principal_id, transformations: [{ transformation_id: id, name: null, rank: 100 }], groups: [] });
    expect(store.audit.readPage(100, 0).items.filter(e => e.event_type === 'TRANSFORMATION_BOUND')).toHaveLength(1);
    expect((await signed('GET', '/v1/agent/transformations')).json().transformations).toHaveLength(1);
    expect((await req('DELETE', url + '/' + id, undefined, provisioner.token)).json()).toEqual({ ...ids, status: 'unbound' });
    expect((await req('DELETE', url + '/' + id, undefined, provisioner.token)).statusCode).toBe(404);
    expect((await req('GET', url, undefined, provisioner.token)).json().transformations).toEqual([]);
    expect((await signed('GET', '/v1/agent/transformations')).json().transformations).toHaveLength(0);
  });
  it('rejects foreign provisioner agents, invalid targets and pending drafts', async () => {
    const provisioner = (await req('POST', '/v1/owner/provisioners', { name: 'Runtime' })).json();
    const url = '/v1/provisioner/agents/' + personal.agent_principal_id + '/transformations';
    const foreignAgentUrl = '/v1/provisioner/agents/' + orgAgent.agent_principal_id + '/transformations';
    const foreignId = await create({ rule: cap }, '/v1/owner/organizations/' + orgId + '/transformations');
    const draftId = (await signed('POST', '/v1/agent/transformation-drafts', personal, { rule: cap, justification: 'Limit output' })).json().transformation_draft_id;
    for (const body of [undefined, {}, { transformation_id: 'invalid' }, { transformation_id: crypto.randomUUID() }, { transformation_id: foreignId }]) {
      expect((await req('POST', url, body, provisioner.token)).statusCode).toBe(400);
    }
    expect((await req('POST', url, { transformation_id: draftId }, provisioner.token)).statusCode).toBe(409);
    expect((await req('GET', foreignAgentUrl, undefined, provisioner.token)).statusCode).toBe(404);
    expect((await req('POST', foreignAgentUrl, { transformation_id: foreignId }, provisioner.token)).statusCode).toBe(404);
    expect((await req('DELETE', foreignAgentUrl + '/' + foreignId, undefined, provisioner.token)).statusCode).toBe(404);
    expect((await req('DELETE', url + '/' + foreignId, undefined, provisioner.token)).statusCode).toBe(404);
  });
  it('lists organization agent bindings and group memberships for its provisioner only', async () => {
    const prefix = '/v1/owner/organizations/' + orgId;
    const group = (await req('POST', prefix + '/policy-groups', { name: 'Team' })).json();
    await req('POST', prefix + '/policy-groups/' + group.group_id + '/agents/' + orgAgent.agent_principal_id);
    const provisioner = (await req('POST', prefix + '/provisioners', { name: 'Org runtime' })).json();
    const id = await create({ rule: cap, name: 'Org cap' }, prefix + '/transformations');
    const url = '/v1/provisioner/agents/' + orgAgent.agent_principal_id + '/transformations';
    expect((await req('POST', url, { transformation_id: id }, provisioner.token)).json().status).toBe('bound');
    expect((await req('GET', url, undefined, provisioner.token)).json()).toEqual({
      agent_principal_id: orgAgent.agent_principal_id,
      transformations: [{ transformation_id: id, name: 'Org cap', rank: 100 }],
      groups: [{ group_id: group.group_id, name: 'Team', membership_id: expect.any(String) }],
    });
    expect((await req('GET', '/v1/provisioner/agents/' + personal.agent_principal_id + '/transformations', undefined, provisioner.token)).statusCode).toBe(404);
  });
});
