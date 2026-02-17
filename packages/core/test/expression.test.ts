import { describe, it, expect } from 'vitest';
import { evaluateExpr } from '../src/expression.js';

describe('expression evaluator', () => {
  const data = {
    payload: {
      amount_minor: 5000,
      currency: 'USD',
      category: 'hairdresser',
      domain: 'example.com',
      items: [{ sku: 'ABC123' }],
    },
    relying_party: {
      domain: 'example.com',
    },
  };

  it('eq operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'eq', value: 'USD' } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'eq', value: 'EUR' } }, data)).toBe(false);
  });

  it('neq operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'neq', value: 'EUR' } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'neq', value: 'USD' } }, data)).toBe(false);
  });

  it('gt operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.amount_minor', op: 'gt', value: 1000 } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.amount_minor', op: 'gt', value: 5000 } }, data)).toBe(false);
  });

  it('gte operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.amount_minor', op: 'gte', value: 5000 } }, data)).toBe(true);
  });

  it('lt operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.amount_minor', op: 'lt', value: 10000 } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.amount_minor', op: 'lt', value: 5000 } }, data)).toBe(false);
  });

  it('lte operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.amount_minor', op: 'lte', value: 5000 } }, data)).toBe(true);
  });

  it('in operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'in', value: ['USD', 'EUR'] } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'in', value: ['EUR', 'GBP'] } }, data)).toBe(false);
  });

  it('nin operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'nin', value: ['EUR', 'GBP'] } }, data)).toBe(true);
  });

  it('regex operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.domain', op: 'regex', value: '^example\\.' } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.domain', op: 'regex', value: '^google\\.' } }, data)).toBe(false);
  });

  it('exists operator', () => {
    expect(evaluateExpr({ match: { path: '$.payload.currency', op: 'exists' } }, data)).toBe(true);
    expect(evaluateExpr({ match: { path: '$.payload.nonexistent', op: 'exists' } }, data)).toBe(false);
  });

  it('all combinator', () => {
    expect(evaluateExpr({
      all: [
        { match: { path: '$.payload.currency', op: 'eq', value: 'USD' } },
        { match: { path: '$.payload.amount_minor', op: 'gt', value: 1000 } },
      ],
    }, data)).toBe(true);

    expect(evaluateExpr({
      all: [
        { match: { path: '$.payload.currency', op: 'eq', value: 'USD' } },
        { match: { path: '$.payload.amount_minor', op: 'gt', value: 10000 } },
      ],
    }, data)).toBe(false);
  });

  it('any combinator', () => {
    expect(evaluateExpr({
      any: [
        { match: { path: '$.payload.currency', op: 'eq', value: 'EUR' } },
        { match: { path: '$.payload.currency', op: 'eq', value: 'USD' } },
      ],
    }, data)).toBe(true);
  });

  it('not combinator', () => {
    expect(evaluateExpr({
      not: { match: { path: '$.payload.currency', op: 'eq', value: 'EUR' } },
    }, data)).toBe(true);
  });

  it('array index access', () => {
    expect(evaluateExpr({ match: { path: '$.payload.items[0].sku', op: 'eq', value: 'ABC123' } }, data)).toBe(true);
  });
});
