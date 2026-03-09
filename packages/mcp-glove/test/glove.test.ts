import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GloveServer } from '../src/glove.js';
import type {
  AuthClient,
  AuthorizeResult,
  GloveConfig,
  ToolCallResult,
  UpstreamBridge,
} from '../src/types.js';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const TEST_CONFIG: GloveConfig = {
  serverName: 'office365-outlook',
  upstreamCmd: 'echo',
  upstreamArgs: [],
  upstreamEnv: {},
  profile: 'office365-outlook',
  openleashUrl: 'http://127.0.0.1:8787',
  agentId: 'test-agent',
  privateKeyB64: 'test-private-key',
  subjectId: '00000000-0000-0000-0000-000000000001',
  approvalTimeoutMs: 5000,
  approvalPollIntervalMs: 100,
};

const ALLOW_RESULT: AuthorizeResult = {
  decision_id: 'dec-allow',
  action_id: 'act-allow',
  action_hash: 'hash-allow',
  result: 'ALLOW',
  matched_rule_id: 'rule-1',
  reason: 'Matched allow rule',
  proof_token: 'token-allow',
  proof_expires_at: null,
  obligations: [],
};

const DENY_RESULT: AuthorizeResult = {
  decision_id: 'dec-deny',
  action_id: 'act-deny',
  action_hash: 'hash-deny',
  result: 'DENY',
  matched_rule_id: 'rule-2',
  reason: 'Domain not in allowlist',
  proof_token: null,
  proof_expires_at: null,
  obligations: [],
};

const REQUIRE_APPROVAL_RESULT: AuthorizeResult = {
  decision_id: 'dec-approval',
  action_id: 'act-approval',
  action_hash: 'hash-approval',
  result: 'REQUIRE_APPROVAL',
  matched_rule_id: 'rule-3',
  reason: 'Requires owner approval',
  proof_token: null,
  proof_expires_at: null,
  obligations: [{ obligation_id: 'ob-1', type: 'HUMAN_APPROVAL', status: 'PENDING' }],
};

const UPSTREAM_SUCCESS: ToolCallResult = {
  content: [{ type: 'text', text: '{"id": "draft-123", "status": "created"}' }],
  isError: false,
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeUpstream(): UpstreamBridge {
  return {
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'create_draft',
          description: 'Create an email draft',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'update_draft',
          description: 'Update an existing draft',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_email',
          description: 'Get an email by id (read-only)',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue(UPSTREAM_SUCCESS),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAuth(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    authorize: vi.fn().mockResolvedValue(ALLOW_RESULT),
    createApprovalRequest: vi.fn().mockResolvedValue({
      approval_request_id: 'ar-123',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }),
    getApprovalRequest: vi.fn().mockResolvedValue({
      approval_request_id: 'ar-123',
      status: 'APPROVED',
      approval_token: 'approval-token-xyz',
    }),
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('GloveServer', () => {
  // ── Transparency ─────────────────────────────────────────────────────────

  it('tools/list returns upstream tool names unchanged (transparency check)', async () => {
    const upstream = makeUpstream();
    const glove = new GloveServer(TEST_CONFIG, upstream, makeAuth());

    const result = await glove.handleListTools();
    const tools = result.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name)).toContain('create_draft');
    expect(tools.map((t) => t.name)).toContain('update_draft');
    expect(tools.map((t) => t.name)).toContain('get_email');
    // Upstream called exactly once with no transformation
    expect(upstream.listTools).toHaveBeenCalledOnce();
  });

  // ── ALLOW flow ───────────────────────────────────────────────────────────

  it('ALLOW: forwards tool call to upstream and returns result', async () => {
    const upstream = makeUpstream();
    const auth = makeAuth({ authorize: vi.fn().mockResolvedValue(ALLOW_RESULT) });
    const glove = new GloveServer(TEST_CONFIG, upstream, auth);

    const result = await glove.handleCallTool('create_draft', {
      to_recipients: ['alice@example.com'],
      subject: 'Interview preparation',
      body: 'Hi Alice,',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { type: 'text'; text: string }).text).toContain('draft-123');

    // Auth was called exactly once
    expect(auth.authorize).toHaveBeenCalledOnce();
    // Upstream was called after ALLOW decision
    expect(upstream.callTool).toHaveBeenCalledWith('create_draft', expect.objectContaining({
      to_recipients: ['alice@example.com'],
    }));
  });

  // ── DENY flow ────────────────────────────────────────────────────────────

  it('DENY: does NOT call upstream and returns structured OPENLEASH_DENY error', async () => {
    const upstream = makeUpstream();
    const auth = makeAuth({ authorize: vi.fn().mockResolvedValue(DENY_RESULT) });
    const glove = new GloveServer(TEST_CONFIG, upstream, auth);

    const result = await glove.handleCallTool('send_email', {
      to_recipients: ['external@blocked.com'],
      subject: 'Send test',
    });

    expect(result.isError).toBe(true);

    const payload = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(payload.code).toBe('OPENLEASH_DENY');
    expect(payload.tool_name).toBe('send_email');
    expect(payload.action_type).toBe('communication.send');
    expect(payload.message).toBeTruthy();

    // Upstream must NEVER be called on DENY
    expect(upstream.callTool).not.toHaveBeenCalled();
  });

  // ── REQUIRE_APPROVAL: approve flow ────────────────────────────────────────

  it('REQUIRE_APPROVAL + APPROVED: suspends, waits, then forwards to upstream', async () => {
    const upstream = makeUpstream();

    // First authorize call → REQUIRE_APPROVAL
    // Second authorize call (with approval token) → ALLOW
    const authorize = vi.fn()
      .mockResolvedValueOnce(REQUIRE_APPROVAL_RESULT)
      .mockResolvedValueOnce(ALLOW_RESULT);

    const auth = makeAuth({
      authorize,
      createApprovalRequest: vi.fn().mockResolvedValue({
        approval_request_id: 'ar-approve-flow',
        status: 'PENDING',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
      getApprovalRequest: vi.fn().mockResolvedValue({
        approval_request_id: 'ar-approve-flow',
        status: 'APPROVED',
        approval_token: 'approval-tok-approve',
      }),
    });

    const glove = new GloveServer(TEST_CONFIG, upstream, auth);

    const result = await glove.handleCallTool('confirm_send_draft', {
      draft_id: 'draft-abc',
    });

    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { type: 'text'; text: string }).text).toContain('draft-123');

    // Authorize called twice: once for initial check, once with approval token
    expect(authorize).toHaveBeenCalledTimes(2);
    // Second call must include the approval token
    expect(authorize).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action_type: 'communication.send.confirm' }),
      'approval-tok-approve',
    );

    // Upstream called after approval
    expect(upstream.callTool).toHaveBeenCalledWith('confirm_send_draft', expect.any(Object));
  });

  // ── REQUIRE_APPROVAL: deny flow ───────────────────────────────────────────

  it('REQUIRE_APPROVAL + DENIED: returns OPENLEASH_APPROVAL_DENIED error, never calls upstream', async () => {
    const upstream = makeUpstream();

    const auth = makeAuth({
      authorize: vi.fn().mockResolvedValue(REQUIRE_APPROVAL_RESULT),
      createApprovalRequest: vi.fn().mockResolvedValue({
        approval_request_id: 'ar-deny-flow',
        status: 'PENDING',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
      getApprovalRequest: vi.fn().mockResolvedValue({
        approval_request_id: 'ar-deny-flow',
        status: 'DENIED',
      }),
    });

    const glove = new GloveServer(TEST_CONFIG, upstream, auth);

    const result = await glove.handleCallTool('prepare_send_draft', { draft_id: 'draft-xyz' });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(payload.code).toBe('OPENLEASH_APPROVAL_DENIED');
    expect(payload.approval_request_id).toBe('ar-deny-flow');
    expect(payload.tool_name).toBe('prepare_send_draft');
    expect(payload.action_type).toBe('communication.send.prepare');

    expect(upstream.callTool).not.toHaveBeenCalled();
  });

  // ── REQUIRE_APPROVAL: timeout flow ────────────────────────────────────────

  it('REQUIRE_APPROVAL + timeout: returns OPENLEASH_APPROVAL_TIMEOUT error', async () => {
    const upstream = makeUpstream();

    // getApprovalRequest always returns PENDING → will time out
    const auth = makeAuth({
      authorize: vi.fn().mockResolvedValue(REQUIRE_APPROVAL_RESULT),
      createApprovalRequest: vi.fn().mockResolvedValue({
        approval_request_id: 'ar-timeout',
        status: 'PENDING',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
      getApprovalRequest: vi.fn().mockResolvedValue({
        approval_request_id: 'ar-timeout',
        status: 'PENDING',
      }),
    });

    // Use a very short timeout so the test doesn't block
    const config: GloveConfig = { ...TEST_CONFIG, approvalTimeoutMs: 300, approvalPollIntervalMs: 50 };
    const glove = new GloveServer(config, upstream, auth);

    const result = await glove.handleCallTool('create_draft', {
      to_recipients: ['bob@example.com'],
      subject: 'Timeout test',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(payload.code).toBe('OPENLEASH_APPROVAL_TIMEOUT');
    expect(payload.approval_request_id).toBe('ar-timeout');

    expect(upstream.callTool).not.toHaveBeenCalled();
  }, 10_000 /* allow for polling time */);

  // ── Fail-safe: auth error on write tool ──────────────────────────────────

  it('auth service error on write tool → OPENLEASH_AUTH_ERROR, no upstream call', async () => {
    const upstream = makeUpstream();

    const auth = makeAuth({
      authorize: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const glove = new GloveServer(TEST_CONFIG, upstream, auth);

    const result = await glove.handleCallTool('update_draft', { draft_id: 'draft-1' });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(payload.code).toBe('OPENLEASH_AUTH_ERROR');

    expect(upstream.callTool).not.toHaveBeenCalled();
  });

  // ── Read-only / uncovered tool passthrough ───────────────────────────────

  it('read-only tool (get_email) passes through without auth check', async () => {
    const upstream = makeUpstream();
    const auth = makeAuth();
    const glove = new GloveServer(TEST_CONFIG, upstream, auth);

    const result = await glove.handleCallTool('get_email', { id: 'email-999' });

    expect(result.isError).toBeFalsy();
    // Auth must NOT have been called
    expect(auth.authorize).not.toHaveBeenCalled();
    // Upstream called directly
    expect(upstream.callTool).toHaveBeenCalledWith('get_email', { id: 'email-999' });
  });
});

// ─── Profile unit tests ───────────────────────────────────────────────────────

describe('office365-outlook profile', () => {
  it('buildPayload extracts recipient domains', async () => {
    const { buildPayload } = await import('../src/profiles/office365-outlook.js');
    const payload = buildPayload('send_email', {
      to_recipients: ['alice@example.com', 'bob@contoso.com'],
      subject: 'Hello',
    });
    expect(payload.recipient_count).toBe(2);
    expect(payload.recipient_domains).toContain('example.com');
    expect(payload.recipient_domains).toContain('contoso.com');
  });

  it('buildPayload handles Graph API recipient shape', async () => {
    const { buildPayload } = await import('../src/profiles/office365-outlook.js');
    const payload = buildPayload('create_draft', {
      to_recipients: [
        { emailAddress: { address: 'carol@fab.io', name: 'Carol' } },
      ],
    });
    expect(payload.recipient_count).toBe(1);
    expect((payload.recipient_domains as string[])[0]).toBe('fab.io');
  });

  it('ACTION_MAP covers all required tool names', async () => {
    const { ACTION_MAP } = await import('../src/profiles/office365-outlook.js');
    expect(ACTION_MAP['create_draft']).toBe('communication.draft.create');
    expect(ACTION_MAP['update_draft']).toBe('communication.draft.update');
    expect(ACTION_MAP['prepare_send_draft']).toBe('communication.send.prepare');
    expect(ACTION_MAP['confirm_send_draft']).toBe('communication.send.confirm');
    expect(ACTION_MAP['send_email']).toBe('communication.send');
  });
});
