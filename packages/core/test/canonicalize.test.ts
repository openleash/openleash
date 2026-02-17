import { describe, it, expect } from 'vitest';
import { canonicalJson, computeActionHash, sha256Hex } from '../src/canonicalize.js';
import type { ActionRequest } from '../src/types.js';

describe('canonicalize', () => {
  it('produces stable hash for identical objects', () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
  });

  it('handles floats correctly per RFC8785', () => {
    const obj = { amount: 49.99, count: 3 };
    const canonical = canonicalJson(obj);
    // RFC8785 formats numbers as shortest representation
    expect(canonical).toContain('49.99');
    expect(canonical).toContain('3');
  });

  it('computes action hash deterministically', () => {
    const action: ActionRequest = {
      action_id: '00000000-0000-0000-0000-000000000001',
      action_type: 'purchase',
      requested_at: '2024-01-15T10:30:00.000Z',
      principal: { agent_id: 'test-agent' },
      subject: { principal_id: '00000000-0000-0000-0000-000000000002' },
      payload: { amount_minor: 5000, currency: 'USD' },
    };

    const hash1 = computeActionHash(action);
    const hash2 = computeActionHash(action);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sha256Hex works', () => {
    const hash = sha256Hex('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});
