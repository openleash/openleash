import { describe, it, expect } from 'vitest';
import { generateSigningKey } from '../src/keys.js';
import { issueProofToken, verifyProofToken } from '../src/tokens.js';

describe('PASETO tokens', () => {
  it('issue and verify roundtrip', async () => {
    const key = generateSigningKey();

    const { token, expiresAt, claims } = await issueProofToken({
      key,
      decisionId: '00000000-0000-0000-0000-000000000001',
      ownerPrincipalId: '00000000-0000-0000-0000-000000000002',
      agentId: 'test-agent',
      actionType: 'purchase',
      actionHash: 'abc123def456',
      matchedRuleId: 'rule-1',
      ttlSeconds: 120,
    });

    expect(token).toMatch(/^v4\.public\./);
    expect(claims.iss).toBe('openleash');
    expect(claims.agent_id).toBe('test-agent');
    expect(claims.action_hash).toBe('abc123def456');

    const result = await verifyProofToken(token, [key]);
    expect(result.valid).toBe(true);
    expect(result.claims?.agent_id).toBe('test-agent');
  });

  it('verification fails with wrong key', async () => {
    const key1 = generateSigningKey();
    const key2 = generateSigningKey();

    const { token } = await issueProofToken({
      key: key1,
      decisionId: '00000000-0000-0000-0000-000000000001',
      ownerPrincipalId: '00000000-0000-0000-0000-000000000002',
      agentId: 'test-agent',
      actionType: 'purchase',
      actionHash: 'abc123def456',
      matchedRuleId: 'rule-1',
      ttlSeconds: 120,
    });

    const result = await verifyProofToken(token, [key2]);
    expect(result.valid).toBe(false);
  });
});
