import { describe, it, expect } from 'vitest';
import { parsePolicyYaml, validatePolicyYaml } from '../src/policy-parser.js';

describe('policy parser', () => {
  it('parses valid policy', () => {
    const yaml = `
version: 1
default: deny
rules:
  - id: r1
    effect: allow
    action: purchase
    constraints:
      amount_max: 10000
`;
    const policy = parsePolicyYaml(yaml);
    expect(policy.version).toBe(1);
    expect(policy.default).toBe('deny');
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].id).toBe('r1');
  });

  it('rejects invalid policy', () => {
    const yaml = `
version: 2
default: maybe
rules: "not an array"
`;
    expect(() => parsePolicyYaml(yaml)).toThrow();
  });

  it('validates valid policy', () => {
    const yaml = `
version: 1
default: allow
rules:
  - id: r1
    effect: deny
    action: "*"
`;
    const result = validatePolicyYaml(yaml);
    expect(result.valid).toBe(true);
  });

  it('reports validation errors', () => {
    const yaml = `
version: 1
default: deny
rules:
  - id: r1
    effect: invalid
    action: purchase
`;
    const result = validatePolicyYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
