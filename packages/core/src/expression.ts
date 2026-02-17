import { jsonPathGet } from './jsonpath.js';
import type { PolicyExpr, PolicyExprMatch } from './types.js';

export function evaluateExpr(expr: PolicyExpr, data: unknown): boolean {
  if ('all' in expr) {
    return expr.all.every((e) => evaluateExpr(e, data));
  }
  if ('any' in expr) {
    return expr.any.some((e) => evaluateExpr(e, data));
  }
  if ('not' in expr) {
    return !evaluateExpr(expr.not, data);
  }
  if ('match' in expr) {
    return evaluateMatch(expr.match, data);
  }
  return false;
}

function evaluateMatch(match: PolicyExprMatch, data: unknown): boolean {
  const actual = jsonPathGet(data, match.path);
  const { op, value } = match;

  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'in':
      if (!Array.isArray(value)) return false;
      return value.includes(actual);
    case 'nin':
      if (!Array.isArray(value)) return false;
      return !value.includes(actual);
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case 'lte':
      return typeof actual === 'number' && typeof value === 'number' && actual <= value;
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'gte':
      return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    case 'regex': {
      if (typeof actual !== 'string' || typeof value !== 'string') return false;
      try {
        return new RegExp(value).test(actual);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
