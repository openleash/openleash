import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { bootstrapState } from '../src/bootstrap.js';
import {
  readState,
  writeState,
  writeUserFile,
  createFileDataStore,
} from '@openleash/core';
import type { FastifyInstance } from 'fastify';

describe('POST /v1/owner/recover', () => {
  let app: FastifyInstance;
  let rootDir: string;
  let dataDir: string;
  let ownerId: string;
  const userEmail = 'recover-target@example.com';

  function listInvites(): string[] {
    const dir = path.join(dataDir, 'invites');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  }

  function readAuditLog(): Array<{ event_type: string; metadata_json: Record<string, unknown> }> {
    const filePath = path.join(dataDir, 'audit.log.jsonl');
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
  }

  beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-recover-test-'));
    dataDir = path.join(rootDir, 'data');

    bootstrapState(rootDir);
    const config = loadConfig(rootDir);

    ownerId = crypto.randomUUID();
    writeUserFile(dataDir, {
      user_principal_id: ownerId,
      display_name: 'Recover Target',
      status: 'ACTIVE',
      attributes: {},
      created_at: new Date().toISOString(),
      contact_identities: [
        {
          contact_id: crypto.randomUUID(),
          type: 'EMAIL',
          value: userEmail,
          verified: false,
          added_at: new Date().toISOString(),
        },
      ],
      passphrase_hash: 'placeholder',
      passphrase_salt: 'placeholder',
      passphrase_set_at: new Date().toISOString(),
    });

    const state = readState(dataDir);
    state.users.push({
      user_principal_id: ownerId,
      path: `./users/${ownerId}.md`,
    });
    writeState(dataDir, state);

    const store = createFileDataStore(dataDir);
    const { app: server } = await createServer({ config, dataDir, store });
    app = server;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('returns generic 200 + creates an invite when the email matches a user', async () => {
    const before = new Set(listInvites());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/recover',
      payload: { email: userEmail },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(typeof body.message).toBe('string');

    const after = listInvites();
    const newInvites = after.filter((f) => !before.has(f));
    expect(newInvites).toHaveLength(1);

    const invite = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'invites', newInvites[0]), 'utf-8'),
    );
    expect(invite.user_principal_id).toBe(ownerId);
    expect(invite.used).toBe(false);
    expect(new Date(invite.expires_at).getTime()).toBeGreaterThan(Date.now());

    const auditEntries = readAuditLog().filter(
      (e) => e.event_type === 'USER_RECOVERY_REQUESTED',
    );
    expect(auditEntries.length).toBeGreaterThan(0);
    const last = auditEntries[auditEntries.length - 1];
    expect(last.metadata_json.matched).toBe(true);
    expect(last.metadata_json.user_principal_id).toBe(ownerId);
  });

  it('returns the same generic 200 response when no user matches', async () => {
    const before = new Set(listInvites());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/recover',
      payload: { email: 'nobody@example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');

    const after = listInvites();
    expect(after.length).toBe(before.size);

    const last = readAuditLog()
      .filter((e) => e.event_type === 'USER_RECOVERY_REQUESTED')
      .at(-1);
    expect(last?.metadata_json.matched).toBe(false);
    expect(last?.metadata_json.user_principal_id).toBe(null);
  });

  it('matches the email case-insensitively', async () => {
    const before = new Set(listInvites());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/recover',
      payload: { email: userEmail.toUpperCase() },
    });
    expect(res.statusCode).toBe(200);

    const after = listInvites();
    const newInvites = after.filter((f) => !before.has(f));
    expect(newInvites).toHaveLength(1);
  });

  it('rejects malformed email payloads with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/owner/recover',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});
