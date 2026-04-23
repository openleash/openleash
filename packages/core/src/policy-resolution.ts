import type { Policy } from './types.js';
import type { StateBinding } from './types.js';

/**
 * Policy groups (v1, 2026-04-23) introduced a third tier of policy scope.
 * Today's bindings have `applies_to_agent_principal_id`; we added
 * `applies_to_group_id`. The three tiers are:
 *
 *   1. Agent-specific: applies_to_agent_principal_id === <agent_principal_id>
 *   2. Group: applies_to_group_id ∈ <agent's group memberships>
 *   3. Owner-wide: both null
 *
 * Evaluation is specific-first. For an agent's authorize() request, we
 * flatten rules from tier 1, then tier 2, then tier 3, and run the
 * existing engine's first-match logic. Today's single-binding behavior
 * is preserved: if you have one owner-wide binding, it lands in tier 3
 * alone and evaluates exactly as before.
 */
export function orderBindingsBySpecificity(
  bindings: StateBinding[],
  agentPrincipalId: string,
  agentGroupIds: Set<string>,
): StateBinding[] {
  const agentSpecific: StateBinding[] = [];
  const group: StateBinding[] = [];
  const ownerWide: StateBinding[] = [];

  for (const b of bindings) {
    // Pre-groups bindings may have applies_to_group_id absent (undefined).
    // Treat absent the same as null to stay compatible with older state.md.
    const groupId = b.applies_to_group_id ?? null;

    if (b.applies_to_agent_principal_id === agentPrincipalId) {
      agentSpecific.push(b);
    } else if (groupId && agentGroupIds.has(groupId)) {
      group.push(b);
    } else if (b.applies_to_agent_principal_id === null && groupId === null) {
      ownerWide.push(b);
    }
    // else: binding applies to a different agent or a group the agent isn't in — skip.
  }

  return [...agentSpecific, ...group, ...ownerWide];
}

/**
 * Merge an ordered list of policies (most specific first) into one Policy
 * by concatenating rules. The merged `default` is taken from the most
 * specific layer (index 0) — if tier 1 has a policy, its default wins;
 * otherwise tier 2; otherwise tier 3. Empty input yields a deny-by-default
 * policy with no rules (caller treats this as "no policy bound").
 */
export function mergePolicyLayers(layers: Policy[]): Policy {
  if (layers.length === 0) {
    return { version: 1, default: 'deny', rules: [] };
  }
  return {
    version: 1,
    default: layers[0].default,
    rules: layers.flatMap((p) => p.rules),
  };
}
