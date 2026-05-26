import { describe, it, expect } from 'vitest';
import { orderBindingsBySpecificity, mergePolicyLayers } from '../src/policy-resolution.js';
import type { Policy, StateBinding } from '../src/types.js';

const AGENT_A = 'agent-a-principal';
const GROUP_HR = 'group-hr';
const GROUP_FINANCE = 'group-finance';

function binding(overrides: Partial<StateBinding>): StateBinding {
    return {
        owner_type: 'org',
        owner_id: 'org-1',
        policy_id: 'p-0',
        applies_to_agent_principal_id: null,
        applies_to_group_id: null,
        ...overrides,
    };
}

describe('orderBindingsBySpecificity', () => {
    it('returns empty for empty input', () => {
        expect(orderBindingsBySpecificity([], AGENT_A, new Set())).toEqual([]);
    });

    it('keeps today\'s single owner-wide binding behavior unchanged', () => {
        // Pre-groups clients never set applies_to_group_id. The helper must
        // treat undefined same as null so upgraded data works out of the box.
        const b = binding({ policy_id: 'p-1', applies_to_group_id: undefined });
        const ordered = orderBindingsBySpecificity([b], AGENT_A, new Set());
        expect(ordered).toHaveLength(1);
        expect(ordered[0].policy_id).toBe('p-1');
    });

    it('orders agent > group > owner-wide', () => {
        const ownerWide = binding({ policy_id: 'p-owner' });
        const groupHr = binding({ policy_id: 'p-hr', applies_to_group_id: GROUP_HR });
        const agentSpecific = binding({ policy_id: 'p-agent', applies_to_agent_principal_id: AGENT_A });

        const ordered = orderBindingsBySpecificity(
            [ownerWide, groupHr, agentSpecific],
            AGENT_A,
            new Set([GROUP_HR]),
        );
        expect(ordered.map((b) => b.policy_id)).toEqual(['p-agent', 'p-hr', 'p-owner']);
    });

    it('skips group bindings for groups the agent does not belong to', () => {
        const hrPolicy = binding({ policy_id: 'p-hr', applies_to_group_id: GROUP_HR });
        const financePolicy = binding({ policy_id: 'p-finance', applies_to_group_id: GROUP_FINANCE });

        // Agent only in HR.
        const ordered = orderBindingsBySpecificity(
            [hrPolicy, financePolicy],
            AGENT_A,
            new Set([GROUP_HR]),
        );
        expect(ordered).toHaveLength(1);
        expect(ordered[0].policy_id).toBe('p-hr');
    });

    it('skips agent-specific bindings for other agents', () => {
        const otherAgent = binding({
            policy_id: 'p-other',
            applies_to_agent_principal_id: 'agent-b-principal',
        });
        const ownerWide = binding({ policy_id: 'p-owner' });

        const ordered = orderBindingsBySpecificity(
            [otherAgent, ownerWide],
            AGENT_A,
            new Set(),
        );
        expect(ordered).toHaveLength(1);
        expect(ordered[0].policy_id).toBe('p-owner');
    });

    it('keeps all tiers when agent belongs to multiple groups', () => {
        const hrPolicy = binding({ policy_id: 'p-hr', applies_to_group_id: GROUP_HR });
        const financePolicy = binding({ policy_id: 'p-finance', applies_to_group_id: GROUP_FINANCE });
        const ownerWide = binding({ policy_id: 'p-owner' });

        const ordered = orderBindingsBySpecificity(
            [hrPolicy, financePolicy, ownerWide],
            AGENT_A,
            new Set([GROUP_HR, GROUP_FINANCE]),
        );
        expect(ordered.map((b) => b.policy_id).sort()).toEqual(['p-finance', 'p-hr', 'p-owner']);
        // Owner-wide must still come last.
        expect(ordered[ordered.length - 1].policy_id).toBe('p-owner');
    });

    it('sorts owner-wide bindings by rank ascending', () => {
        const late = binding({ policy_id: 'p-late', rank: 300 });
        const early = binding({ policy_id: 'p-early', rank: 100 });
        const middle = binding({ policy_id: 'p-middle', rank: 200 });

        const ordered = orderBindingsBySpecificity([late, early, middle], AGENT_A, new Set());
        expect(ordered.map((b) => b.policy_id)).toEqual(['p-early', 'p-middle', 'p-late']);
    });

    it('sorts group bindings by rank without breaking tier dominance', () => {
        const groupLate = binding({ policy_id: 'p-grp-late', applies_to_group_id: GROUP_HR, rank: 999 });
        const groupEarly = binding({ policy_id: 'p-grp-early', applies_to_group_id: GROUP_HR, rank: 1 });
        // Agent-specific has the highest possible rank — must still win.
        const agent = binding({ policy_id: 'p-agent', applies_to_agent_principal_id: AGENT_A, rank: 9999 });

        const ordered = orderBindingsBySpecificity(
            [groupLate, agent, groupEarly],
            AGENT_A,
            new Set([GROUP_HR]),
        );
        expect(ordered.map((b) => b.policy_id)).toEqual(['p-agent', 'p-grp-early', 'p-grp-late']);
    });

    it('treats absent rank as 100', () => {
        const explicit50 = binding({ policy_id: 'p-50', rank: 50 });
        const noRank = binding({ policy_id: 'p-default' });
        const explicit200 = binding({ policy_id: 'p-200', rank: 200 });

        const ordered = orderBindingsBySpecificity(
            [explicit200, noRank, explicit50],
            AGENT_A,
            new Set(),
        );
        expect(ordered.map((b) => b.policy_id)).toEqual(['p-50', 'p-default', 'p-200']);
    });

    it('preserves insertion order among equal ranks (stable sort)', () => {
        const a = binding({ policy_id: 'p-a', rank: 100 });
        const b = binding({ policy_id: 'p-b', rank: 100 });
        const c = binding({ policy_id: 'p-c', rank: 100 });

        const ordered = orderBindingsBySpecificity([a, b, c], AGENT_A, new Set());
        expect(ordered.map((x) => x.policy_id)).toEqual(['p-a', 'p-b', 'p-c']);
    });

    it('group-tier rank is global across groups, not per-group', () => {
        // Engineering policy gets rank 100, finance policy gets rank 200.
        // Engineering should fire first regardless of which group the
        // policies belong to, because rank is global within the tier.
        const finPolicy = binding({ policy_id: 'p-fin', applies_to_group_id: GROUP_FINANCE, rank: 200 });
        const engPolicy = binding({ policy_id: 'p-eng', applies_to_group_id: GROUP_HR, rank: 100 });
        const engOther = binding({ policy_id: 'p-eng-2', applies_to_group_id: GROUP_HR, rank: 300 });

        const ordered = orderBindingsBySpecificity(
            [finPolicy, engPolicy, engOther],
            AGENT_A,
            new Set([GROUP_HR, GROUP_FINANCE]),
        );
        expect(ordered.map((x) => x.policy_id)).toEqual(['p-eng', 'p-fin', 'p-eng-2']);
    });
});

describe('mergePolicyLayers', () => {
    function p(id: string, def: 'allow' | 'deny' | 'passthrough' | 'require_approval', ruleId: string, action: string, effect: 'allow' | 'deny'): Policy {
        return {
            version: 1,
            default: def,
            rules: [{ id: ruleId, effect, action }],
        } as Policy & { _id?: string };
    }

    it('empty input yields a deny-by-default policy with no rules', () => {
        const merged = mergePolicyLayers([]);
        expect(merged.default).toBe('deny');
        expect(merged.rules).toEqual([]);
    });

    it('single layer passes through (today\'s behavior preserved)', () => {
        const policy = p('p1', 'allow', 'r1', 'purchase', 'allow');
        const merged = mergePolicyLayers([policy]);
        expect(merged.default).toBe('allow');
        expect(merged.rules).toEqual(policy.rules);
    });

    it('concatenates rules in layer order', () => {
        const agentSpecific = p('p-agent', 'deny', 'r-agent', 'purchase.large', 'allow');
        const groupPolicy = p('p-group', 'allow', 'r-group', 'purchase.*', 'deny');
        const ownerWide = p('p-owner', 'allow', 'r-owner', '*', 'allow');

        const merged = mergePolicyLayers([agentSpecific, groupPolicy, ownerWide]);
        expect(merged.rules.map((r) => r.id)).toEqual(['r-agent', 'r-group', 'r-owner']);
    });

    it('uses the most-specific layer\'s default', () => {
        const specific = p('p-agent', 'allow', 'r-agent', 'x', 'allow');
        const ownerWide = p('p-owner', 'deny', 'r-owner', 'y', 'allow');
        const merged = mergePolicyLayers([specific, ownerWide]);
        expect(merged.default).toBe('allow');
    });

    it('a passthrough layer defers its default to the next layer', () => {
        const specific = p('p-agent', 'passthrough', 'r-agent', 'x', 'allow');
        const ownerWide = p('p-owner', 'deny', 'r-owner', 'y', 'allow');
        const merged = mergePolicyLayers([specific, ownerWide]);
        expect(merged.default).toBe('deny');
        // Rules from both layers are still concatenated in order.
        expect(merged.rules.map((r) => r.id)).toEqual(['r-agent', 'r-owner']);
    });

    it('skips consecutive passthrough layers to the first concrete default', () => {
        const agent = p('p-agent', 'passthrough', 'r-agent', 'x', 'allow');
        const group = p('p-group', 'passthrough', 'r-group', 'y', 'allow');
        const ownerWide = p('p-owner', 'require_approval', 'r-owner', 'z', 'allow');
        const merged = mergePolicyLayers([agent, group, ownerWide]);
        expect(merged.default).toBe('require_approval');
    });

    it('all-passthrough layers fail safe to deny', () => {
        const a = p('p-a', 'passthrough', 'r-a', 'x', 'allow');
        const b = p('p-b', 'passthrough', 'r-b', 'y', 'allow');
        const merged = mergePolicyLayers([a, b]);
        expect(merged.default).toBe('deny');
    });

    it('a single passthrough layer (nothing to defer to) fails safe to deny', () => {
        const only = p('p-only', 'passthrough', 'r-only', 'x', 'allow');
        const merged = mergePolicyLayers([only]);
        expect(merged.default).toBe('deny');
    });
});
