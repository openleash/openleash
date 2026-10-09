import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AuditCursorNotFoundError,
  FileAuditStore,
  decodeAuditCursor,
  encodeAuditCursor,
  readAuditAfter,
} from '../src/audit.js';
import type { AuditStore } from '../src/audit.js';
import { auditEventInScope, toOcsfEvent, OCSF_SCHEMA_VERSION } from '../src/audit-export.js';
import type { AuditEvent } from '../src/types.js';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    event_id: crypto.randomUUID(),
    timestamp: '2026-10-01T12:00:00.000Z',
    event_type: 'TEST_EVENT',
    principal_id: null,
    action_id: null,
    decision_id: null,
    metadata_json: {},
    ...overrides,
  };
}

const OPTS = { productVersion: '9.9.9' };

describe('toOcsfEvent', () => {
  it('maps an ALLOW decision to API Activity with Security Control attributes', () => {
    const e = event({
      event_type: 'DECISION_CREATED',
      principal_id: 'agent-pid',
      decision_id: 'dec-1',
      metadata_json: {
        decision_id: 'dec-1',
        result: 'ALLOW',
        action_type: 'payments.send',
        agent_id: 'acme-bot',
        agent_principal_id: 'agent-pid',
        owner_type: 'org',
        owner_id: 'org-1',
      },
    });
    const o = toOcsfEvent(e, OPTS);
    expect(o).toMatchObject({
      class_uid: 6003,
      category_uid: 6,
      activity_id: 99,
      type_uid: 600399,
      time: Date.parse(e.timestamp),
      action_id: 1,
      disposition_id: 1,
      status_id: 1,
      severity_id: 1,
      api: { operation: 'payments.send' },
      actor: { user: { uid: 'agent-pid', name: 'acme-bot', type: 'Agent' } },
      metadata: {
        version: OCSF_SCHEMA_VERSION,
        uid: e.event_id,
        event_code: 'DECISION_CREATED',
        correlation_uid: 'dec-1',
        profiles: ['security_control'],
        product: { name: 'OpenLeash', version: '9.9.9' },
      },
    });
    expect((o.unmapped as Record<string, unknown>).metadata).toEqual(e.metadata_json);
  });

  it('maps DENY and REQUIRE_* results', () => {
    const deny = toOcsfEvent(
      event({ event_type: 'DECISION_CREATED', metadata_json: { result: 'DENY' } }),
      OPTS,
    );
    expect(deny).toMatchObject({ action_id: 2, disposition_id: 2, status_id: 2, severity_id: 2 });

    const pending = toOcsfEvent(
      event({ event_type: 'DECISION_CREATED', metadata_json: { result: 'REQUIRE_APPROVAL' } }),
      OPTS,
    );
    expect(pending).toMatchObject({ action_id: 99, action: 'Require Approval', status_id: 99 });
  });

  it('maps logins to Authentication with the user', () => {
    const o = toOcsfEvent(
      event({ event_type: 'USER_LOGIN', metadata_json: { user_principal_id: 'u1', display_name: 'Ada' } }),
      OPTS,
    );
    expect(o).toMatchObject({
      class_uid: 3002,
      activity_id: 1,
      type_uid: 300201,
      user: { uid: 'u1', name: 'Ada' },
      actor: { user: { uid: 'u1', type: 'User' } },
    });
  });

  it('maps org membership changes to Group Management', () => {
    const o = toOcsfEvent(
      event({
        event_type: 'ORG_MEMBER_ADDED',
        principal_id: 'admin-1',
        metadata_json: { org_id: 'org-1', user_principal_id: 'u2', role: 'org_viewer' },
      }),
      OPTS,
    );
    expect(o).toMatchObject({
      class_uid: 3006,
      activity_id: 3,
      group: { uid: 'org-1', type: 'Organization' },
      user: { uid: 'u2' },
      privileges: ['org_viewer'],
      actor: { user: { uid: 'admin-1' } },
    });
  });

  it('infers Entity Management activity from the event suffix', () => {
    const created = toOcsfEvent(
      event({ event_type: 'API_KEY_CREATED', metadata_json: { api_key_id: 'k1', name: 'Splunk' } }),
      OPTS,
    );
    expect(created).toMatchObject({
      class_uid: 3004,
      activity_id: 1,
      entity: { type: 'API Key', uid: 'k1', name: 'Splunk' },
    });

    const group = toOcsfEvent(
      event({ event_type: 'POLICY_GROUP_DELETED', metadata_json: { group_id: 'g1' } }),
      OPTS,
    );
    expect(group).toMatchObject({ activity_id: 4, entity: { type: 'Policy Group', uid: 'g1' } });
  });

  it('falls back to Base Event for unknown event types', () => {
    const o = toOcsfEvent(event({ event_type: 'SERVER_STARTED' }), OPTS);
    expect(o).toMatchObject({ class_uid: 0, activity_id: 99, activity_name: 'Server Started' });
    expect(o.actor).toBeUndefined();
  });

  it('marks *_FAILED events as failures', () => {
    const o = toOcsfEvent(event({ event_type: 'WEBHOOK_DELIVERY_FAILED' }), OPTS);
    expect(o).toMatchObject({ status_id: 2, status: 'Failure' });
  });
});

describe('auditEventInScope', () => {
  const scope = { ownerType: 'org' as const, ownerId: 'org-1' };
  const agents = new Set(['agent-1']);

  it('keeps events attributed to the owner', () => {
    expect(
      auditEventInScope(event({ metadata_json: { owner_type: 'org', owner_id: 'org-1' } }), scope, new Set()),
    ).toBe(true);
  });

  it('keeps events directly about the owner principal', () => {
    expect(auditEventInScope(event({ principal_id: 'org-1' }), scope, new Set())).toBe(true);
    expect(auditEventInScope(event({ metadata_json: { org_id: 'org-1' } }), scope, new Set())).toBe(true);
    expect(
      auditEventInScope(event({ metadata_json: { from_owner_id: 'org-1', to_owner_id: 'org-2' } }), scope, new Set()),
    ).toBe(true);
  });

  it('drops events about a current agent that were attributed to a previous owner', () => {
    const before = event({
      metadata_json: { agent_principal_id: 'agent-1', owner_type: 'user', owner_id: 'u1' },
    });
    expect(auditEventInScope(before, scope, agents)).toBe(false);
  });

  it('keeps legacy agent events without an owner', () => {
    expect(auditEventInScope(event({ principal_id: 'agent-1' }), scope, agents)).toBe(true);
  });

  it('drops unrelated events', () => {
    expect(auditEventInScope(event({ principal_id: 'someone-else' }), scope, agents)).toBe(false);
  });
});

describe('audit cursors', () => {
  it('round-trips and rejects garbage', () => {
    const e = event();
    expect(decodeAuditCursor(encodeAuditCursor(e))).toEqual({ event_id: e.event_id, timestamp: e.timestamp });
    expect(decodeAuditCursor('not-a-cursor')).toBeNull();
    expect(decodeAuditCursor(Buffer.from('{"v":2}').toString('base64url'))).toBeNull();
  });
});

describe('readByPrincipalsAfter', () => {
  let tmpDir: string;
  let filePath: string;
  let store: FileAuditStore;
  let events: AuditEvent[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-export-'));
    filePath = path.join(tmpDir, 'audit.log.jsonl');
    store = new FileAuditStore(tmpDir);
    events = [];
    // 10 events alternating between principals a and b, one minute apart.
    for (let i = 0; i < 10; i++) {
      const e = event({
        principal_id: i % 2 === 0 ? 'a' : 'b',
        timestamp: new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString(),
        metadata_json: { seq: i },
      });
      fs.appendFileSync(filePath, JSON.stringify(e) + '\n', 'utf-8');
      events.push(e);
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const seqs = (items: AuditEvent[]) => items.map((e) => (e.metadata_json as { seq: number }).seq);

  it('pages oldest-first from the start', () => {
    const page = store.readByPrincipalsAfter(new Set(['a']), { limit: 3 });
    expect(seqs(page.items)).toEqual([0, 2, 4]);
    expect(page.has_more).toBe(true);
  });

  it('continues after a cursor event, even one from another principal', () => {
    const page = store.readByPrincipalsAfter(new Set(['a']), { afterEventId: events[5].event_id, limit: 10 });
    expect(seqs(page.items)).toEqual([6, 8]);
    expect(page.has_more).toBe(false);
  });

  it('is not shifted by new appends', () => {
    const first = store.readByPrincipalsAfter(new Set(['a', 'b']), { limit: 4 });
    store.append('LATER', { seq: 10 }, { principal_id: 'a' });
    const next = store.readByPrincipalsAfter(new Set(['a', 'b']), {
      afterEventId: first.items[3].event_id,
      limit: 100,
    });
    expect(seqs(next.items)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it('starts at `since` without a cursor', () => {
    const page = store.readByPrincipalsAfter(new Set(['a', 'b']), {
      since: events[7].timestamp,
      limit: 10,
    });
    expect(seqs(page.items)).toEqual([7, 8, 9]);
  });

  it('throws on an unknown cursor', () => {
    expect(() =>
      store.readByPrincipalsAfter(new Set(['a']), { afterEventId: 'missing', limit: 10 }),
    ).toThrow(AuditCursorNotFoundError);
  });

  it('readAuditAfter fallback matches the native implementation', () => {
    // A store without readByPrincipalsAfter (e.g. an older plugin).
    const legacy: AuditStore = {
      append: store.append.bind(store),
      readPage: store.readPage.bind(store),
      readByPrincipal: store.readByPrincipal.bind(store),
      getTotal: store.getTotal.bind(store),
    };
    const principals = new Set(['a', 'b']);
    for (const opts of [
      { limit: 3 },
      { afterEventId: events[2].event_id, afterTimestamp: events[2].timestamp, limit: 4 },
      { afterEventId: events[8].event_id, afterTimestamp: events[8].timestamp, limit: 4 },
      { since: events[6].timestamp, limit: 10 },
    ]) {
      const native = store.readByPrincipalsAfter(principals, opts);
      const fallback = readAuditAfter(legacy, principals, opts);
      expect(seqs(fallback.items)).toEqual(seqs(native.items));
      expect(fallback.has_more).toBe(native.has_more);
    }
  });
});
