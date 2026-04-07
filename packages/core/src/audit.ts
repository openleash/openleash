import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuditEvent } from './types.js';

/** @deprecated Use `store.audit.append()` instead. */
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

/** @deprecated Use `store.audit.readPage()` instead. */
export function readAuditLog(
  dataDir: string,
  limit: number = 50,
  cursor: number = 0
): { items: AuditEvent[]; next_cursor: string | null; total: number } {
  const filePath = path.join(dataDir, 'audit.log.jsonl');
  if (!fs.existsSync(filePath)) {
    return { items: [], next_cursor: null, total: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return { items: [], next_cursor: null, total: 0 };
  }

  const lines = content.split('\n');
  const total = lines.length;
  const start = cursor;
  const end = Math.min(start + limit, total);
  const items: AuditEvent[] = [];

  for (let i = start; i < end; i++) {
    if (lines[i].trim()) {
      items.push(JSON.parse(lines[i]));
    }
  }

  const nextCursor = end < total ? String(end) : null;
  return { items, next_cursor: nextCursor, total };
}

// ─── AuditStore interface ─────────────────────────────────────────────

export interface AuditStore {
  append(
    eventType: string,
    metadata: Record<string, unknown>,
    opts?: {
      principal_id?: string | null;
      action_id?: string | null;
      decision_id?: string | null;
    },
  ): AuditEvent;

  readPage(limit: number, offset: number): { items: AuditEvent[]; total: number };

  readByPrincipal(
    principalId: string,
    relatedPrincipalIds: Set<string>,
    limit: number,
    offset: number,
  ): { items: AuditEvent[]; total: number };

  getTotal(): number;
}

// ─── FileAuditStore ───────────────────────────────────────────────────

interface LineIndex {
  /** Byte offset where each line starts */
  offsets: number[];
  /** Total file size when this index was built */
  fileSize: number;
  /** principal ID → set of line numbers */
  principalLines: Map<string, Set<number>>;
}

export class FileAuditStore implements AuditStore {
  private readonly filePath: string;
  private readonly dataDir: string;
  private index: LineIndex | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'audit.log.jsonl');
  }

  append(
    eventType: string,
    metadata: Record<string, unknown> = {},
    opts?: {
      principal_id?: string | null;
      action_id?: string | null;
      decision_id?: string | null;
    },
  ): AuditEvent {
    const event = appendAuditEvent(this.dataDir, eventType, metadata, opts);

    // Update index incrementally if it exists
    if (this.index) {
      const line = JSON.stringify(event) + '\n';
      const lineNum = this.index.offsets.length;
      this.index.offsets.push(this.index.fileSize);
      this.index.fileSize += Buffer.byteLength(line, 'utf-8');
      this.indexPrincipalIds(event, lineNum);
    }

    return event;
  }

  readPage(limit: number, offset: number): { items: AuditEvent[]; total: number } {
    this.ensureIndex();
    const total = this.index!.offsets.length;
    if (total === 0 || offset >= total) {
      return { items: [], total };
    }
    // Read from the end so page 1 = newest entries
    const start = Math.max(total - offset - limit, 0);
    const end = total - offset;
    const items = this.readLines(start, end);
    return { items, total };
  }

  readByPrincipal(
    principalId: string,
    relatedPrincipalIds: Set<string>,
    limit: number,
    offset: number,
  ): { items: AuditEvent[]; total: number } {
    this.ensureIndex();
    const idx = this.index!;

    // Collect all matching line numbers from the principal index
    const lineSet = new Set<number>();
    const addLines = (pid: string) => {
      const lines = idx.principalLines.get(pid);
      if (lines) for (const ln of lines) lineSet.add(ln);
    };

    addLines(principalId);
    for (const pid of relatedPrincipalIds) addLines(pid);

    // Sort ascending
    const sorted = [...lineSet].sort((a, b) => a - b);
    const total = sorted.length;
    // Read from the end so page 1 = newest entries
    const start = Math.max(total - offset - limit, 0);
    const end = total - offset;
    const page = sorted.slice(start, end);

    const items = this.readSpecificLines(page);
    return { items, total };
  }

  getTotal(): number {
    this.ensureIndex();
    return this.index!.offsets.length;
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private ensureIndex(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      // File missing — empty index
      this.index = { offsets: [], fileSize: 0, principalLines: new Map() };
      return;
    }

    const fileSize = stat.size;
    if (this.index && this.index.fileSize === fileSize) return; // unchanged
    if (this.index && fileSize > this.index.fileSize) {
      // File grew — incremental update
      this.readNewBytes(this.index.fileSize, fileSize);
      return;
    }
    // Full rebuild (first load or file shrank)
    this.rebuildIndex(fileSize);
  }

  private rebuildIndex(fileSize: number): void {
    this.index = { offsets: [], fileSize, principalLines: new Map() };
    if (fileSize === 0) return;

    const content = fs.readFileSync(this.filePath, 'utf-8');
    let pos = 0;
    let lineNum = 0;
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.length === 0 && pos >= fileSize) break; // trailing empty from split
      this.index.offsets.push(pos);
      pos += Buffer.byteLength(line, 'utf-8') + 1; // +1 for \n
      if (line.trim()) {
        try {
          const event: AuditEvent = JSON.parse(line);
          this.indexPrincipalIds(event, lineNum);
        } catch {
          // skip malformed lines
        }
      }
      lineNum++;
    }
    // Remove trailing empty line if file doesn't end with content after last \n
    if (this.index.offsets.length > 0) {
      const lastOffset = this.index.offsets[this.index.offsets.length - 1];
      if (lastOffset >= fileSize) {
        this.index.offsets.pop();
      }
    }
  }

  private readNewBytes(fromSize: number, toSize: number): void {
    const idx = this.index!;
    const buf = Buffer.alloc(toSize - fromSize);
    const fd = fs.openSync(this.filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, fromSize);
    } finally {
      fs.closeSync(fd);
    }

    const chunk = buf.toString('utf-8');
    let pos = fromSize;
    let lineNum = idx.offsets.length;
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.length === 0 && pos >= toSize) break;
      idx.offsets.push(pos);
      pos += Buffer.byteLength(line, 'utf-8') + 1;
      if (line.trim()) {
        try {
          const event: AuditEvent = JSON.parse(line);
          this.indexPrincipalIds(event, lineNum);
        } catch {
          // skip malformed
        }
      }
      lineNum++;
    }
    // Remove trailing empty
    if (idx.offsets.length > 0) {
      const lastOffset = idx.offsets[idx.offsets.length - 1];
      if (lastOffset >= toSize) {
        idx.offsets.pop();
      }
    }
    idx.fileSize = toSize;
  }

  private indexPrincipalIds(event: AuditEvent, lineNum: number): void {
    const idx = this.index!;
    const addPrincipal = (pid: string | null | undefined) => {
      if (!pid) return;
      let set = idx.principalLines.get(pid);
      if (!set) {
        set = new Set();
        idx.principalLines.set(pid, set);
      }
      set.add(lineNum);
    };

    addPrincipal(event.principal_id);
    const meta = event.metadata_json as Record<string, unknown>;
    addPrincipal(meta.user_principal_id as string | undefined);
    addPrincipal(meta.owner_principal_id as string | undefined); // backward compat with old audit logs
    addPrincipal(meta.agent_principal_id as string | undefined);
    addPrincipal(meta.org_id as string | undefined);
    // Index owner_id for org-owned agent/policy events
    if (meta.owner_type === 'org') addPrincipal(meta.owner_id as string | undefined);
  }

  private readLines(start: number, end: number): AuditEvent[] {
    const idx = this.index!;
    if (idx.offsets.length === 0) return [];

    const startByte = idx.offsets[start];
    const endByte = end < idx.offsets.length ? idx.offsets[end] : idx.fileSize;
    const buf = Buffer.alloc(endByte - startByte);
    const fd = fs.openSync(this.filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, startByte);
    } finally {
      fs.closeSync(fd);
    }

    const items: AuditEvent[] = [];
    const lines = buf.toString('utf-8').split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          items.push(JSON.parse(line));
        } catch {
          // skip malformed
        }
      }
    }
    return items;
  }

  private readSpecificLines(lineNums: number[]): AuditEvent[] {
    if (lineNums.length === 0) return [];
    const idx = this.index!;
    const items: AuditEvent[] = [];
    const fd = fs.openSync(this.filePath, 'r');
    try {
      for (const ln of lineNums) {
        const startByte = idx.offsets[ln];
        const endByte = ln + 1 < idx.offsets.length ? idx.offsets[ln + 1] : idx.fileSize;
        const buf = Buffer.alloc(endByte - startByte);
        fs.readSync(fd, buf, 0, buf.length, startByte);
        const line = buf.toString('utf-8').trim();
        if (line) {
          try {
            items.push(JSON.parse(line));
          } catch {
            // skip malformed
          }
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    return items;
  }
}
