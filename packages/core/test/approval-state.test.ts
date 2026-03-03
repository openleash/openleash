import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  writeApprovalRequestFile,
  readApprovalRequestFile,
  writeSetupInviteFile,
  readSetupInviteFile,
  deleteSetupInviteFile,
} from '../src/state.js';
import type { ApprovalRequestFrontmatter, SetupInvite } from '../src/types.js';

describe('approval request state', () => {
  let dataDir: string;

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-test-'));
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true });
  });

  it('writes and reads approval request file', () => {
    const req: ApprovalRequestFrontmatter = {
      approval_request_id: '00000000-0000-0000-0000-000000000001',
      decision_id: '00000000-0000-0000-0000-000000000002',
      agent_principal_id: '00000000-0000-0000-0000-000000000003',
      agent_id: 'test-agent',
      owner_principal_id: '00000000-0000-0000-0000-000000000004',
      action_type: 'purchase',
      action_hash: 'abc123',
      action: {
        action_id: '00000000-0000-0000-0000-000000000005',
        action_type: 'purchase',
        requested_at: new Date().toISOString(),
        principal: { agent_id: 'test-agent' },
        subject: { principal_id: '00000000-0000-0000-0000-000000000004' },
        payload: { amount: 100 },
      },
      justification: 'Need to purchase supplies',
      context: null,
      status: 'PENDING',
      approval_token: null,
      approval_token_expires_at: null,
      resolved_at: null,
      resolved_by: null,
      denial_reason: null,
      consumed_at: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    writeApprovalRequestFile(dataDir, req);

    const read = readApprovalRequestFile(dataDir, req.approval_request_id);
    expect(read.approval_request_id).toBe(req.approval_request_id);
    expect(read.agent_id).toBe('test-agent');
    expect(read.status).toBe('PENDING');
    expect(read.action_type).toBe('purchase');
  });
});

describe('setup invite state', () => {
  let dataDir: string;

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openleash-test-'));
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true });
  });

  it('writes and reads invite file', () => {
    const invite: SetupInvite = {
      invite_id: '00000000-0000-0000-0000-000000000010',
      owner_principal_id: '00000000-0000-0000-0000-000000000001',
      token_hash: 'hashed-token',
      token_salt: 'salt-value',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    };

    writeSetupInviteFile(dataDir, invite);

    const read = readSetupInviteFile(dataDir, invite.invite_id);
    expect(read.invite_id).toBe(invite.invite_id);
    expect(read.owner_principal_id).toBe(invite.owner_principal_id);
    expect(read.used).toBe(false);
  });

  it('deletes invite file', () => {
    const invite: SetupInvite = {
      invite_id: '00000000-0000-0000-0000-000000000011',
      owner_principal_id: '00000000-0000-0000-0000-000000000001',
      token_hash: 'hashed-token',
      token_salt: 'salt-value',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      used: false,
      used_at: null,
      created_at: new Date().toISOString(),
    };

    writeSetupInviteFile(dataDir, invite);
    deleteSetupInviteFile(dataDir, invite.invite_id);

    expect(() => readSetupInviteFile(dataDir, invite.invite_id)).toThrow();
  });
});
