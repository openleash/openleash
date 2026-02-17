import { describe, it, expect } from 'vitest';
import { evaluateConstraints } from '../src/constraints.js';
import type { ActionRequest } from '../src/types.js';

function makeAction(payload: Record<string, unknown>, rp?: ActionRequest['relying_party']): ActionRequest {
  return {
    action_id: '00000000-0000-0000-0000-000000000001',
    action_type: 'purchase',
    requested_at: '2024-01-15T10:30:00.000Z',
    principal: { agent_id: 'test-agent' },
    subject: { principal_id: '00000000-0000-0000-0000-000000000002' },
    relying_party: rp,
    payload,
  };
}

describe('constraints evaluation', () => {
  it('amount_max passes when under', () => {
    expect(evaluateConstraints(
      { amount_max: 10000 },
      makeAction({ amount_minor: 5000 })
    )).toBe(true);
  });

  it('amount_max fails when over', () => {
    expect(evaluateConstraints(
      { amount_max: 10000 },
      makeAction({ amount_minor: 15000 })
    )).toBe(false);
  });

  it('amount_min passes when over', () => {
    expect(evaluateConstraints(
      { amount_min: 1000 },
      makeAction({ amount_minor: 5000 })
    )).toBe(true);
  });

  it('amount_min fails when under', () => {
    expect(evaluateConstraints(
      { amount_min: 10000 },
      makeAction({ amount_minor: 5000 })
    )).toBe(false);
  });

  it('currency matches', () => {
    expect(evaluateConstraints(
      { currency: ['USD', 'EUR'] },
      makeAction({ currency: 'USD' })
    )).toBe(true);
  });

  it('currency does not match', () => {
    expect(evaluateConstraints(
      { currency: ['USD', 'EUR'] },
      makeAction({ currency: 'GBP' })
    )).toBe(false);
  });

  it('merchant_domain from payload', () => {
    expect(evaluateConstraints(
      { merchant_domain: ['amazon.com'] },
      makeAction({ merchant_domain: 'amazon.com' })
    )).toBe(true);
  });

  it('merchant_domain falls back to relying_party', () => {
    expect(evaluateConstraints(
      { merchant_domain: ['amazon.com'] },
      makeAction({}, { domain: 'amazon.com' })
    )).toBe(true);
  });

  it('allowed_domains passes', () => {
    expect(evaluateConstraints(
      { allowed_domains: ['gmail.com'] },
      makeAction({ domain: 'gmail.com' })
    )).toBe(true);
  });

  it('allowed_domains fails', () => {
    expect(evaluateConstraints(
      { allowed_domains: ['gmail.com'] },
      makeAction({ domain: 'unknown.com' })
    )).toBe(false);
  });

  it('blocked_domains blocks', () => {
    expect(evaluateConstraints(
      { blocked_domains: ['spam.com'] },
      makeAction({ domain: 'spam.com' })
    )).toBe(false);
  });

  it('blocked_domains passes for non-blocked', () => {
    expect(evaluateConstraints(
      { blocked_domains: ['spam.com'] },
      makeAction({ domain: 'safe.com' })
    )).toBe(true);
  });
});
