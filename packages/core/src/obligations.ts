import * as crypto from 'node:crypto';
import type {
  ActionRequest,
  DecisionResult,
  Obligation,
  PolicyObligation,
  PolicyRequirements,
} from './types.js';

const ASSURANCE_ORDER: Record<string, number> = {
  LOW: 0,
  SUBSTANTIAL: 1,
  HIGH: 2,
};

/**
 * Compute obligations from rule obligations + requirements, then derive decision.
 */
export function computeObligationsAndDecision(
  ruleObligations: PolicyObligation[] | undefined,
  requirements: PolicyRequirements | undefined,
  action: ActionRequest
): { result: DecisionResult; obligations: Obligation[] } {
  const obligations: Obligation[] = [];

  // Collect explicit obligations from rule
  if (ruleObligations) {
    for (const ob of ruleObligations) {
      obligations.push({
        obligation_id: crypto.randomUUID(),
        type: ob.type as Obligation['type'],
        status: 'PENDING',
        details_json: ob.params ?? {},
      });
    }
  }

  // Check requirements -> may add STEP_UP_AUTH obligation
  if (requirements?.min_assurance_level) {
    const required = requirements.min_assurance_level;
    const actual = (action.payload.assurance_level as string) || 'LOW';
    const requiredLevel = ASSURANCE_ORDER[required] ?? 0;
    const actualLevel = ASSURANCE_ORDER[actual] ?? 0;
    if (actualLevel < requiredLevel) {
      obligations.push({
        obligation_id: crypto.randomUUID(),
        type: 'STEP_UP_AUTH',
        status: 'PENDING',
        details_json: { min_assurance_level: required },
      });
    }
  }

  // Determine decision from obligations (blocking precedence)
  const types = new Set(obligations.map((o) => o.type));

  let result: DecisionResult = 'ALLOW';
  if (types.has('HUMAN_APPROVAL')) {
    result = 'REQUIRE_APPROVAL';
  } else if (types.has('STEP_UP_AUTH')) {
    result = 'REQUIRE_STEP_UP';
  } else if (types.has('DEPOSIT')) {
    result = 'REQUIRE_DEPOSIT';
  }
  // COUNTERPARTY_ATTESTATION is non-blocking: result stays ALLOW

  return { result, obligations };
}
