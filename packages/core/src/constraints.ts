import type { ActionRequest, PolicyConstraints } from './types.js';

export function evaluateConstraints(
  constraints: PolicyConstraints,
  action: ActionRequest
): boolean {
  const payload = action.payload;

  // amount_min / amount_max
  if (constraints.amount_min !== undefined || constraints.amount_max !== undefined) {
    const amount = payload.amount_minor;
    if (typeof amount !== 'number') return false;
    if (constraints.amount_min !== undefined && amount < constraints.amount_min) return false;
    if (constraints.amount_max !== undefined && amount > constraints.amount_max) return false;
  }

  // currency
  if (constraints.currency !== undefined) {
    const currency = payload.currency;
    if (typeof currency !== 'string') return false;
    if (!constraints.currency.includes(currency)) return false;
  }

  // merchant_domain
  if (constraints.merchant_domain !== undefined) {
    const domain = (payload.merchant_domain as string | undefined)
      ?? action.relying_party?.domain;
    if (typeof domain !== 'string') return false;
    if (!constraints.merchant_domain.includes(domain)) return false;
  }

  // allowed_domains
  if (constraints.allowed_domains !== undefined) {
    const domain = (payload.domain as string | undefined)
      ?? action.relying_party?.domain;
    if (typeof domain !== 'string') return false;
    if (!constraints.allowed_domains.includes(domain)) return false;
  }

  // blocked_domains
  if (constraints.blocked_domains !== undefined) {
    const domain = (payload.domain as string | undefined)
      ?? action.relying_party?.domain;
    if (typeof domain === 'string' && constraints.blocked_domains.includes(domain)) return false;
  }

  return true;
}
