import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuditEvent } from './types.js';

export function appendAuditEvent(
  dataDir: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  opts?: {
    principal_id?: string | null;
    action_id?: string | null;
    decision_id?: string | null;
  }
): AuditEvent {
  const event: AuditEvent = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    principal_id: opts?.principal_id ?? null,
    action_id: opts?.action_id ?? null,
    decision_id: opts?.decision_id ?? null,
    metadata_json: metadata,
  };

  const filePath = path.join(dataDir, 'audit.log.jsonl');
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8');
  return event;
}

export function readAuditLog(
  dataDir: string,
  limit: number = 50,
  cursor: number = 0
): { items: AuditEvent[]; next_cursor: string | null } {
  const filePath = path.join(dataDir, 'audit.log.jsonl');
  if (!fs.existsSync(filePath)) {
    return { items: [], next_cursor: null };
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return { items: [], next_cursor: null };
  }

  const lines = content.split('\n');
  const start = cursor;
  const end = Math.min(start + limit, lines.length);
  const items: AuditEvent[] = [];

  for (let i = start; i < end; i++) {
    if (lines[i].trim()) {
      items.push(JSON.parse(lines[i]));
    }
  }

  const nextCursor = end < lines.length ? String(end) : null;
  return { items, next_cursor: nextCursor };
}
