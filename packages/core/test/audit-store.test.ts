import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileAuditStore } from '../src/audit.js';
import type { AuditEvent } from '../src/types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'audit-store-'));
}

function writeEvent(filePath: string, overrides: Partial<AuditEvent> = {}): AuditEvent {
  const event: AuditEvent = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'TEST_EVENT',
    principal_id: null,
    action_id: null,
    decision_id: null,
    metadata_json: {},
    ...overrides,
  };
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8');
  return event;
}

describe('FileAuditStore', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    filePath = path.join(tmpDir, 'audit.log.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── readPage ───────────────────────────────────────────────────────

  it('readPage returns empty for missing file', () => {
    const store = new FileAuditStore(tmpDir);
    const result = store.readPage(25, 0);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('readPage returns empty for empty file', () => {
    fs.writeFileSync(filePath, '', 'utf-8');
    const store = new FileAuditStore(tmpDir);
    const result = store.readPage(25, 0);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('readPage returns single line', () => {
    const event = writeEvent(filePath, { event_type: 'SINGLE' });
    const store = new FileAuditStore(tmpDir);
    const result = store.readPage(25, 0);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].event_id).toBe(event.event_id);
    expect(result.items[0].event_type).toBe('SINGLE');
  });

  it('readPage paginates correctly', () => {
    const events: AuditEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(writeEvent(filePath, { event_type: `EVT_${i}` }));
    }

    const store = new FileAuditStore(tmpDir);

    // Page 1 — newest entries (read from end)
    const p1 = store.readPage(3, 0);
    expect(p1.total).toBe(10);
    expect(p1.items).toHaveLength(3);
    expect(p1.items[0].event_type).toBe('EVT_7');
    expect(p1.items[2].event_type).toBe('EVT_9');

    // Page 2
    const p2 = store.readPage(3, 3);
    expect(p2.items).toHaveLength(3);
    expect(p2.items[0].event_type).toBe('EVT_4');

    // Last page (partial)
    const p4 = store.readPage(3, 9);
    expect(p4.items).toHaveLength(1);
    expect(p4.items[0].event_type).toBe('EVT_0');

    // Beyond range
    const p5 = store.readPage(3, 10);
    expect(p5.items).toHaveLength(0);
    expect(p5.total).toBe(10);
  });

  // ─── readByPrincipal ───────────────────────────────────────────────

  it('readByPrincipal filters by user_principal_id in metadata', () => {
    writeEvent(filePath, { metadata_json: { user_principal_id: 'owner-a' } });
    writeEvent(filePath, { metadata_json: { user_principal_id: 'owner-b' } });
    writeEvent(filePath, { metadata_json: { user_principal_id: 'owner-a' } });

    const store = new FileAuditStore(tmpDir);
    const result = store.readByPrincipal('owner-a', new Set(), 25, 0);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.every(e =>
      (e.metadata_json as Record<string, unknown>).user_principal_id === 'owner-a'
    )).toBe(true);
  });

  it('readByPrincipal includes related agent principal IDs', () => {
    writeEvent(filePath, { metadata_json: { user_principal_id: 'owner-a' } });
    writeEvent(filePath, { metadata_json: { agent_principal_id: 'agent-1' } });
    writeEvent(filePath, { principal_id: 'agent-2' });
    writeEvent(filePath, { metadata_json: { user_principal_id: 'owner-b' } });

    const store = new FileAuditStore(tmpDir);
    const result = store.readByPrincipal('owner-a', new Set(['agent-1', 'agent-2']), 25, 0);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('readByPrincipal paginates filtered results', () => {
    for (let i = 0; i < 10; i++) {
      writeEvent(filePath, {
        event_type: `EVT_${i}`,
        metadata_json: { user_principal_id: 'owner-a' },
      });
      writeEvent(filePath, { metadata_json: { user_principal_id: 'other' } });
    }

    const store = new FileAuditStore(tmpDir);
    const p1 = store.readByPrincipal('owner-a', new Set(), 3, 0);
    expect(p1.total).toBe(10);
    expect(p1.items).toHaveLength(3);
    expect(p1.items[0].event_type).toBe('EVT_7');

    const p2 = store.readByPrincipal('owner-a', new Set(), 3, 3);
    expect(p2.items).toHaveLength(3);
    expect(p2.items[0].event_type).toBe('EVT_4');

    const pLast = store.readByPrincipal('owner-a', new Set(), 3, 9);
    expect(pLast.items).toHaveLength(1);
    expect(pLast.items[0].event_type).toBe('EVT_0');
  });

  // ─── append + incremental index ────────────────────────────────────

  it('append updates index incrementally', () => {
    const store = new FileAuditStore(tmpDir);

    // Start with empty
    expect(store.getTotal()).toBe(0);

    // Append events
    const e1 = store.append('EVT_1', { user_principal_id: 'owner-a' });
    expect(store.getTotal()).toBe(1);

    const e2 = store.append('EVT_2', { user_principal_id: 'owner-b' });
    expect(store.getTotal()).toBe(2);

    // Read back
    const page = store.readPage(10, 0);
    expect(page.items).toHaveLength(2);
    expect(page.items[0].event_id).toBe(e1.event_id);
    expect(page.items[1].event_id).toBe(e2.event_id);

    // Principal index updated too
    const byOwner = store.readByPrincipal('owner-a', new Set(), 10, 0);
    expect(byOwner.total).toBe(1);
    expect(byOwner.items[0].event_id).toBe(e1.event_id);
  });

  // ─── Staleness detection ───────────────────────────────────────────

  it('detects file growth from external writes', () => {
    writeEvent(filePath, { event_type: 'INITIAL' });

    const store = new FileAuditStore(tmpDir);
    expect(store.getTotal()).toBe(1);

    // External write (simulates another process appending)
    writeEvent(filePath, { event_type: 'EXTERNAL' });

    // Should detect growth and return updated total
    expect(store.getTotal()).toBe(2);
    const page = store.readPage(10, 0);
    expect(page.items[1].event_type).toBe('EXTERNAL');
  });

  it('handles truncated file gracefully', () => {
    writeEvent(filePath, { event_type: 'A' });
    writeEvent(filePath, { event_type: 'B' });

    const store = new FileAuditStore(tmpDir);
    expect(store.getTotal()).toBe(2);

    // Truncate the file (simulates corruption)
    fs.writeFileSync(filePath, '', 'utf-8');

    // Should rebuild index
    expect(store.getTotal()).toBe(0);
  });

  it('handles missing file after initial load', () => {
    writeEvent(filePath, { event_type: 'A' });
    const store = new FileAuditStore(tmpDir);
    expect(store.getTotal()).toBe(1);

    // Delete the file
    fs.unlinkSync(filePath);

    expect(store.getTotal()).toBe(0);
  });

  // ─── getTotal ──────────────────────────────────────────────────────

  it('getTotal returns O(1) count', () => {
    for (let i = 0; i < 50; i++) {
      writeEvent(filePath);
    }
    const store = new FileAuditStore(tmpDir);
    expect(store.getTotal()).toBe(50);
  });
});
