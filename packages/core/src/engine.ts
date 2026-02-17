import * as crypto from 'node:crypto';
import type {
  ActionRequest,
  AuthorizeResponse,
  DecisionResult,
  EvaluationTrace,
  Obligation,
  Policy,
  PolicyRule,
  RuleTrace,
} from './types.js';
import { computeActionHash } from './canonicalize.js';
import { evaluateExpr } from './expression.js';
import { evaluateConstraints } from './constraints.js';
import { computeObligationsAndDecision } from './obligations.js';

export interface EngineResult {
  response: AuthorizeResponse;
  trace: EvaluationTrace;
  proofRequired: boolean;
  proofTtlSeconds: number | null;
}

export function evaluate(
  action: ActionRequest,
  policy: Policy,
  options?: {
    defaultProofTtl?: number;
    issueProof?: (params: {
      decisionId: string;
      action: ActionRequest;
      actionHash: string;
      matchedRuleId: string | null;
      ttlSeconds: number;
    }) => Promise<{ token: string; expiresAt: string }>;
  }
): EngineResult {
  const actionHash = computeActionHash(action);
  const decisionId = crypto.randomUUID();
  const traces: RuleTrace[] = [];

  let matchedRule: PolicyRule | null = null;

  for (const rule of policy.rules) {
    const patternMatch = matchAction(action.action_type, rule.action);
    let whenMatch: boolean | null = null;
    let constraintsMatch: boolean | null = null;
    let finalMatch = false;

    if (patternMatch) {
      // Evaluate when expression
      if (rule.when) {
        whenMatch = evaluateExpr(rule.when, action);
      } else {
        whenMatch = true;
      }

      if (whenMatch) {
        // Evaluate constraints
        if (rule.constraints) {
          constraintsMatch = evaluateConstraints(rule.constraints, action);
        } else {
          constraintsMatch = true;
        }

        if (constraintsMatch) {
          finalMatch = true;
        }
      }
    }

    traces.push({
      rule_id: rule.id,
      pattern_match: patternMatch,
      when_match: patternMatch ? whenMatch : null,
      constraints_match: patternMatch && whenMatch ? constraintsMatch : null,
      final_match: finalMatch,
    });

    if (finalMatch && !matchedRule) {
      matchedRule = rule;
      // Don't break — continue for full trace
    }
  }

  // Determine final result
  let result: DecisionResult;
  let obligations: Obligation[] = [];
  let reason: string;

  if (matchedRule) {
    if (matchedRule.effect === 'deny') {
      result = 'DENY';
      reason = `Denied by rule "${matchedRule.id}"`;
    } else {
      const computed = computeObligationsAndDecision(
        matchedRule.obligations,
        matchedRule.requirements,
        action
      );
      result = computed.result;
      obligations = computed.obligations;
      reason = result === 'ALLOW'
        ? `Allowed by rule "${matchedRule.id}"`
        : `Rule "${matchedRule.id}" requires: ${result}`;
    }
  } else {
    // Use default
    result = policy.default === 'allow' ? 'ALLOW' : 'DENY';
    reason = `No rule matched; default policy: ${policy.default}`;
  }

  // Determine proof requirement
  const trustProfile = action.relying_party?.trust_profile;
  const proofRequired =
    (matchedRule?.proof?.required === true) ||
    (trustProfile === 'HIGH' || trustProfile === 'REGULATED');

  const proofTtlSeconds = matchedRule?.proof?.ttl_seconds ?? options?.defaultProofTtl ?? null;

  return {
    response: {
      decision_id: decisionId,
      action_id: action.action_id,
      action_hash: actionHash,
      result,
      matched_rule_id: matchedRule?.id ?? null,
      reason,
      proof_token: null,
      proof_expires_at: null,
      obligations,
    },
    trace: { rules: traces },
    proofRequired,
    proofTtlSeconds,
  };
}

function matchAction(actionType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return actionType === prefix || actionType.startsWith(prefix + '.');
  }
  return actionType === pattern;
}
