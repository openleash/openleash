import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/engine.js';
import type { ActionRequest, Policy } from '../src/types.js';

function makeAction(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    action_id: '00000000-0000-0000-0000-000000000001',
    action_type: 'purchase',
    requested_at: '2024-01-15T10:30:00.000Z',
    principal: { agent_id: 'test-agent' },
    subject: { principal_id: '00000000-0000-0000-0000-000000000002' },
    payload: { amount_minor: 5000, currency: 'USD', merchant_domain: 'example.com' },
    ...overrides,
  };
}

describe('policy engine', () => {
  it('exact action match', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{ id: 'r1', effect: 'allow', action: 'purchase' }],
    };
    const result = evaluate(makeAction(), policy);
    expect(result.response.result).toBe('ALLOW');
    expect(result.response.matched_rule_id).toBe('r1');
  });

  it('prefix wildcard match', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{ id: 'r1', effect: 'allow', action: 'government.*' }],
    };
    const result = evaluate(makeAction({ action_type: 'government.submit_document' }), policy);
    expect(result.response.result).toBe('ALLOW');
    expect(result.response.matched_rule_id).toBe('r1');
  });

  it('star matches all', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{ id: 'r1', effect: 'allow', action: '*' }],
    };
    const result = evaluate(makeAction({ action_type: 'anything.here' }), policy);
    expect(result.response.result).toBe('ALLOW');
  });

  it('no match uses default deny', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{ id: 'r1', effect: 'allow', action: 'purchase' }],
    };
    const result = evaluate(makeAction({ action_type: 'communication.send' }), policy);
    expect(result.response.result).toBe('DENY');
    expect(result.response.matched_rule_id).toBeNull();
  });

  it('no match uses default allow', () => {
    const policy: Policy = {
      version: 1,
      default: 'allow',
      rules: [{ id: 'r1', effect: 'deny', action: 'purchase' }],
    };
    const result = evaluate(makeAction({ action_type: 'communication.send' }), policy);
    expect(result.response.result).toBe('ALLOW');
  });

  it('deny rule', () => {
    const policy: Policy = {
      version: 1,
      default: 'allow',
      rules: [{ id: 'r1', effect: 'deny', action: 'purchase' }],
    };
    const result = evaluate(makeAction(), policy);
    expect(result.response.result).toBe('DENY');
  });

  it('constraints evaluation', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [
        { id: 'r1', effect: 'allow', action: 'purchase', constraints: { amount_max: 10000 } },
      ],
    };
    // Within constraints
    expect(evaluate(makeAction({ payload: { amount_minor: 5000 } }), policy).response.result).toBe('ALLOW');
    // Exceeds constraints — no match, falls to default
    expect(evaluate(makeAction({ payload: { amount_minor: 15000 } }), policy).response.result).toBe('DENY');
  });

  it('obligations produce REQUIRE_APPROVAL', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{
        id: 'r1',
        effect: 'allow',
        action: 'purchase',
        obligations: [{ type: 'HUMAN_APPROVAL', params: { reason: 'test' } }],
      }],
    };
    const result = evaluate(makeAction(), policy);
    expect(result.response.result).toBe('REQUIRE_APPROVAL');
    expect(result.response.obligations).toHaveLength(1);
    expect(result.response.obligations[0].type).toBe('HUMAN_APPROVAL');
  });

  it('requirements add STEP_UP obligation', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{
        id: 'r1',
        effect: 'allow',
        action: 'purchase',
        requirements: { min_assurance_level: 'SUBSTANTIAL' },
      }],
    };
    const result = evaluate(makeAction({ payload: { amount_minor: 5000, assurance_level: 'LOW' } }), policy);
    expect(result.response.result).toBe('REQUIRE_STEP_UP');
  });

  it('COUNTERPARTY_ATTESTATION is non-blocking', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{
        id: 'r1',
        effect: 'allow',
        action: 'purchase',
        obligations: [{ type: 'COUNTERPARTY_ATTESTATION' }],
      }],
    };
    const result = evaluate(makeAction(), policy);
    expect(result.response.result).toBe('ALLOW');
    expect(result.response.obligations).toHaveLength(1);
    expect(result.response.obligations[0].type).toBe('COUNTERPARTY_ATTESTATION');
  });

  it('obligation precedence: HUMAN_APPROVAL > STEP_UP_AUTH', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{
        id: 'r1',
        effect: 'allow',
        action: 'purchase',
        obligations: [
          { type: 'STEP_UP_AUTH' },
          { type: 'HUMAN_APPROVAL' },
        ],
      }],
    };
    const result = evaluate(makeAction(), policy);
    expect(result.response.result).toBe('REQUIRE_APPROVAL');
  });

  it('proof required when rule.proof.required is true', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{
        id: 'r1',
        effect: 'allow',
        action: 'purchase',
        proof: { required: true },
      }],
    };
    const result = evaluate(makeAction(), policy);
    expect(result.proofRequired).toBe(true);
  });

  it('proof required when trust_profile is REGULATED', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [{ id: 'r1', effect: 'allow', action: 'purchase' }],
    };
    const result = evaluate(makeAction({ relying_party: { trust_profile: 'REGULATED' } }), policy);
    expect(result.proofRequired).toBe(true);
  });

  it('full trace is produced', () => {
    const policy: Policy = {
      version: 1,
      default: 'deny',
      rules: [
        { id: 'r1', effect: 'allow', action: 'purchase', constraints: { amount_max: 100 } },
        { id: 'r2', effect: 'allow', action: 'purchase' },
        { id: 'r3', effect: 'deny', action: 'communication.send' },
      ],
    };
    const result = evaluate(makeAction({ payload: { amount_minor: 5000 } }), policy);
    expect(result.trace.rules).toHaveLength(3);
    expect(result.trace.rules[0].rule_id).toBe('r1');
    expect(result.trace.rules[0].pattern_match).toBe(true);
    expect(result.trace.rules[0].constraints_match).toBe(false);
    expect(result.trace.rules[0].final_match).toBe(false);
    expect(result.trace.rules[1].rule_id).toBe('r2');
    expect(result.trace.rules[1].final_match).toBe(true);
    expect(result.trace.rules[2].pattern_match).toBe(false);
  });
});
