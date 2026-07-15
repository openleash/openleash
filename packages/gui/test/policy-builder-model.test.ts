import { describe, it, expect } from 'vitest';
import {
  addExprChild,
  defaultMatch,
  exprKind,
  getExprAt,
  listToString,
  parseList,
  parseScalar,
  rebuildObligations,
  removeExprAt,
  replaceExprAt,
  scalarToString,
  summarizeExpr,
  swapGroupKind,
  validatePolicyModel,
} from '../src/shared/policy-builder-model.js';
import type { PolicyExpr, PolicyObligation } from '../src/shared/policy-builder-model.js';

describe('scalar value parsing', () => {
  it('parses literals the way YAML would', () => {
    expect(parseScalar('42')).toBe(42);
    expect(parseScalar('-3.5')).toBe(-3.5);
    expect(parseScalar('true')).toBe(true);
    expect(parseScalar('false')).toBe(false);
    expect(parseScalar('null')).toBe(null);
    expect(parseScalar('hello')).toBe('hello');
    expect(parseScalar('')).toBe('');
  });

  it('unquotes double-quoted strings to force string type', () => {
    expect(parseScalar('"true"')).toBe('true');
    expect(parseScalar('"42"')).toBe('42');
  });

  it('round-trips through scalarToString', () => {
    for (const v of [42, -3.5, true, false, null, 'hello', 'true', '42']) {
      expect(parseScalar(scalarToString(v))).toBe(v);
    }
    expect(scalarToString(undefined)).toBe('');
  });

  it('parses and formats lists', () => {
    expect(parseList('a, 2, true')).toEqual(['a', 2, true]);
    expect(parseList('')).toEqual([]);
    expect(listToString(['a', 2, true])).toBe('a, 2, true');
    expect(parseList(listToString(['x', '5', 5]))).toEqual(['x', '5', 5]);
  });
});

describe('expression tree helpers', () => {
  const tree = (): PolicyExpr => ({
    all: [
      { match: { path: '$.a', op: 'eq', value: 1 } },
      {
        any: [
          { match: { path: '$.b', op: 'regex', value: '^x' } },
          { not: { match: { path: '$.c', op: 'exists' } } },
        ],
      },
    ],
  });

  it('navigates by path', () => {
    const t = tree();
    expect(exprKind(getExprAt(t, []))).toBe('all');
    expect(exprKind(getExprAt(t, [1]))).toBe('any');
    expect(exprKind(getExprAt(t, [1, 1]))).toBe('not');
    expect(exprKind(getExprAt(t, [1, 1, 0]))).toBe('match');
    expect(getExprAt(t, [9])).toBeUndefined();
  });

  it('replaces nodes, including the root', () => {
    const t = tree();
    const m = defaultMatch();
    expect(replaceExprAt(t, [], m)).toBe(m);
    const t2 = tree();
    replaceExprAt(t2, [1, 0], m);
    expect(getExprAt(t2, [1, 0])).toBe(m);
  });

  it('removes nodes and collapses empty groups', () => {
    // Removing the only child of a group removes the group.
    let t: PolicyExpr | undefined = { all: [{ match: { path: '$.a', op: 'exists' } }] };
    t = removeExprAt(t, [0]);
    expect(t).toBeUndefined();

    // Removing a NOT's child removes the NOT.
    t = { all: [{ match: { path: '$.a', op: 'exists' } }, { not: { match: { path: '$.b', op: 'exists' } } }] };
    t = removeExprAt(t!, [1, 0]);
    expect(exprKind(t)).toBe('all');
    expect((t as { all: PolicyExpr[] }).all).toHaveLength(1);

    // Removing the root clears the expression.
    expect(removeExprAt(tree(), [])).toBeUndefined();
  });

  it('adds children to groups and swaps group kind', () => {
    const t = tree();
    addExprChild(t, [1], defaultMatch());
    expect((getExprAt(t, [1]) as { any: PolicyExpr[] }).any).toHaveLength(3);

    const g = getExprAt(t, [1])!;
    swapGroupKind(g, 'all');
    expect(exprKind(g)).toBe('all');
    expect((g as { all: PolicyExpr[] }).all).toHaveLength(3);
  });

  it('summarizes expressions for humans', () => {
    const s = summarizeExpr(tree());
    expect(s).toContain('$.a equals 1');
    expect(s).toContain('AND');
    expect(s).toContain('$.b matches regex ^x');
    expect(s).toContain('OR');
    expect(s).toContain('NOT');
  });
});

describe('rebuildObligations', () => {
  const KNOWN = ['HUMAN_APPROVAL', 'STEP_UP_AUTH', 'DEPOSIT', 'COUNTERPARTY_ATTESTATION'];

  it('preserves unknown obligation types verbatim', () => {
    const existing: PolicyObligation[] = [
      { type: 'WEBHOOK_NOTIFY', params: { url: 'https://x' } },
      { type: 'HUMAN_APPROVAL' },
    ];
    const out = rebuildObligations(existing, ['HUMAN_APPROVAL'], KNOWN, new Map());
    expect(out).toEqual([
      { type: 'WEBHOOK_NOTIFY', params: { url: 'https://x' } },
      { type: 'HUMAN_APPROVAL' },
    ]);
    // Unknown types survive even with nothing checked.
    const out2 = rebuildObligations(existing, [], KNOWN, new Map());
    expect(out2).toEqual([{ type: 'WEBHOOK_NOTIFY', params: { url: 'https://x' } }]);
  });

  it('keeps duplicate obligations of a checked type', () => {
    const existing: PolicyObligation[] = [
      { type: 'STEP_UP_AUTH', params: { level: 1 } },
      { type: 'STEP_UP_AUTH', params: { level: 2 } },
    ];
    const out = rebuildObligations(existing, ['STEP_UP_AUTH'], KNOWN, new Map());
    expect(out).toHaveLength(2);
    expect(out[1].params).toEqual({ level: 2 });
  });

  it('restores params from the stash on re-check (uncheck → recheck cycle)', () => {
    const stash = new Map<string, PolicyObligation[]>();
    const existing: PolicyObligation[] = [{ type: 'DEPOSIT', params: { amount: 500 } }];
    // Uncheck: entry moves to the stash.
    const afterUncheck = rebuildObligations(existing, [], KNOWN, stash);
    expect(afterUncheck).toEqual([]);
    expect(stash.get('DEPOSIT')).toEqual([{ type: 'DEPOSIT', params: { amount: 500 } }]);
    // Re-check: params come back instead of a bare { type }.
    const afterRecheck = rebuildObligations(afterUncheck, ['DEPOSIT'], KNOWN, stash);
    expect(afterRecheck).toEqual([{ type: 'DEPOSIT', params: { amount: 500 } }]);
    expect(stash.has('DEPOSIT')).toBe(false);
  });

  it('creates a bare obligation for a newly checked type', () => {
    const out = rebuildObligations(undefined, ['HUMAN_APPROVAL'], KNOWN, new Map());
    expect(out).toEqual([{ type: 'HUMAN_APPROVAL' }]);
  });

  it('applies params patches to the first occurrence', () => {
    const existing: PolicyObligation[] = [
      { type: 'DEPOSIT', params: { amount: 1 } },
      { type: 'DEPOSIT', params: { amount: 2 } },
    ];
    const patch = new Map([['DEPOSIT', { params: { amount: 9 } }]]);
    const out = rebuildObligations(existing, ['DEPOSIT'], KNOWN, new Map(), patch);
    expect(out[0].params).toEqual({ amount: 9 });
    expect(out[1].params).toEqual({ amount: 2 });
    // Clearing params removes the key.
    const cleared = rebuildObligations(out, ['DEPOSIT'], KNOWN, new Map(), new Map([['DEPOSIT', { params: undefined }]]));
    expect(cleared[0].params).toBeUndefined();
  });
});

describe('validatePolicyModel', () => {
  const validModel = () => ({
    version: 1,
    default: 'deny',
    rules: [
      {
        id: 'r1',
        effect: 'allow' as const,
        action: 'payment.*',
        when: { match: { path: '$.payload.merchant_domain', op: 'regex' as const, value: '\\.se$' } },
        proof: { required: true, ttl_seconds: 120 },
      },
    ],
  });

  it('accepts a valid policy', () => {
    expect(validatePolicyModel(validModel())).toEqual([]);
  });

  it('flags missing rule id and action', () => {
    const errors = validatePolicyModel({ default: 'deny', rules: [{ id: '', effect: 'allow', action: '' }] });
    expect(errors.some((e) => e.includes('rule ID'))).toBe(true);
    expect(errors.some((e) => e.includes('action is required'))).toBe(true);
  });

  it('flags an invalid default', () => {
    const errors = validatePolicyModel({ default: 'maybe', rules: [] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Default must be one of');
  });

  it('flags condition problems: bad path, bad regex, empty list, missing value', () => {
    const m = validModel();
    m.rules[0].when = { match: { path: 'payload.x', op: 'regex', value: '(' } } as never;
    let errors = validatePolicyModel(m);
    expect(errors.some((e) => e.includes('must start with "$."'))).toBe(true);
    expect(errors.some((e) => e.includes('not a valid regular expression'))).toBe(true);

    m.rules[0].when = { match: { path: '$.x', op: 'in', value: [] } } as never;
    errors = validatePolicyModel(m);
    expect(errors.some((e) => e.includes('needs at least one value'))).toBe(true);

    m.rules[0].when = { match: { path: '$.x', op: 'eq' } } as never;
    errors = validatePolicyModel(m);
    expect(errors.some((e) => e.includes('needs a value'))).toBe(true);
  });

  it('flags empty groups and bad proof TTL', () => {
    const m = validModel();
    m.rules[0].when = { all: [] } as never;
    m.rules[0].proof = { ttl_seconds: -5 } as never;
    const errors = validatePolicyModel(m);
    expect(errors.some((e) => e.includes('empty ALL group'))).toBe(true);
    expect(errors.some((e) => e.includes('proof TTL'))).toBe(true);
  });

  it('accepts exists without a value', () => {
    const m = validModel();
    m.rules[0].when = { match: { path: '$.x', op: 'exists' } } as never;
    expect(validatePolicyModel(m)).toEqual([]);
  });
});
