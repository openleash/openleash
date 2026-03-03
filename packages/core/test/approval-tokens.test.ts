import { describe, it, expect } from 'vitest';
import { generateSigningKey } from '../src/keys.js';
import {
  issueApprovalToken,
  verifyApprovalToken,
  verifySessionToken,
} from '../src/tokens.js';

describe('approval tokens', () => {
  it('issue and verify roundtrip', async () => {
    const key = generateSigningKey();

    const { token, expiresAt, claims } = await issueApprovalToken({
      key,
      approvalRequestId: '00000000-0000-0000-0000-000000000010',
      ownerPrincipalId: '00000000-0000-0000-0000-000000000001',
      agentId: 'test-agent',
      actionType: 'purchase',
      actionHash: 'hash123',
      ttlSeconds: 3600,
    });

    expect(token).toMatch(/^v4\.public\./);
    expect(claims.iss).toBe('openleash');
    expect(claims.purpose).toBe('approval');
    expect(claims.approval_request_id).toBe('00000000-0000-0000-0000-000000000010');
    expect(claims.action_hash).toBe('hash123');
    expect(expiresAt).toBeDefined();

    const result = await verifyApprovalToken(token, [key]);
    expect(result.valid).toBe(true);
    expect(result.claims?.agent_id).toBe('test-agent');
    expect(result.claims?.purpose).toBe('approval');
  });

  it('rejects token with wrong key', async () => {
    const key1 = generateSigningKey();
    const key2 = generateSigningKey();

    const { token } = await issueApprovalToken({
      key: key1,
      approvalRequestId: '00000000-0000-0000-0000-000000000010',
      ownerPrincipalId: '00000000-0000-0000-0000-000000000001',
      agentId: 'test-agent',
      actionType: 'purchase',
      actionHash: 'hash123',
      ttlSeconds: 3600,
    });

    const result = await verifyApprovalToken(token, [key2]);
    expect(result.valid).toBe(false);
  });

  it('rejects approval token as session token', async () => {
    const key = generateSigningKey();

    const { token } = await issueApprovalToken({
      key,
      approvalRequestId: '00000000-0000-0000-0000-000000000010',
      ownerPrincipalId: '00000000-0000-0000-0000-000000000001',
      agentId: 'test-agent',
      actionType: 'purchase',
      actionHash: 'hash123',
      ttlSeconds: 3600,
    });

    const result = await verifySessionToken(token, [key]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid token purpose');
  });
});
