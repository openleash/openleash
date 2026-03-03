import { describe, it, expect } from 'vitest';
import { generateSigningKey } from '../src/keys.js';
import { issueSessionToken, verifySessionToken } from '../src/tokens.js';

describe('session tokens', () => {
  it('issue and verify roundtrip', async () => {
    const key = generateSigningKey();

    const { token, expiresAt, claims } = await issueSessionToken({
      key,
      ownerPrincipalId: '00000000-0000-0000-0000-000000000001',
      ttlSeconds: 3600,
    });

    expect(token).toMatch(/^v4\.public\./);
    expect(claims.iss).toBe('openleash');
    expect(claims.sub).toBe('00000000-0000-0000-0000-000000000001');
    expect(claims.purpose).toBe('owner_session');
    expect(expiresAt).toBeDefined();

    const result = await verifySessionToken(token, [key]);
    expect(result.valid).toBe(true);
    expect(result.claims?.sub).toBe('00000000-0000-0000-0000-000000000001');
    expect(result.claims?.purpose).toBe('owner_session');
  });

  it('rejects token with wrong key', async () => {
    const key1 = generateSigningKey();
    const key2 = generateSigningKey();

    const { token } = await issueSessionToken({
      key: key1,
      ownerPrincipalId: '00000000-0000-0000-0000-000000000001',
      ttlSeconds: 3600,
    });

    const result = await verifySessionToken(token, [key2]);
    expect(result.valid).toBe(false);
  });

  it('rejects proof token as session token', async () => {
    const key = generateSigningKey();
    const { issueProofToken } = await import('../src/tokens.js');

    const { token } = await issueProofToken({
      key,
      decisionId: '00000000-0000-0000-0000-000000000001',
      ownerPrincipalId: '00000000-0000-0000-0000-000000000002',
      agentId: 'test-agent',
      actionType: 'purchase',
      actionHash: 'abc123',
      matchedRuleId: 'rule-1',
      ttlSeconds: 120,
    });

    const result = await verifySessionToken(token, [key]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid token purpose');
  });
});
