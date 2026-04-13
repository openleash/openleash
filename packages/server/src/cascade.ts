/**
 * Cascading delete helpers for admin operations.
 *
 * Each function deletes the target entity and all dependent entities,
 * returning a summary of what was removed for audit logging.
 */
import type { DataStore } from "@openleash/core";

export interface CascadeSummary {
  agents_removed: number;
  policies_removed: number;
  bindings_removed: number;
  approval_requests_removed: number;
  policy_drafts_removed: number;
  memberships_removed: number;
  org_invites_removed: number;
}

function emptySummary(): CascadeSummary {
  return {
    agents_removed: 0,
    policies_removed: 0,
    bindings_removed: 0,
    approval_requests_removed: 0,
    policy_drafts_removed: 0,
    memberships_removed: 0,
    org_invites_removed: 0,
  };
}

/**
 * Delete an agent and all dependent data:
 * - Agent file
 * - Policies specifically targeting this agent (applies_to_agent_principal_id)
 * - Bindings for those policies
 * - Approval requests referencing this agent
 * - Policy drafts referencing this agent
 */
export function cascadeDeleteAgent(store: DataStore, agentPrincipalId: string): CascadeSummary {
  const summary = emptySummary();
  const state = store.state.getState();

  // Delete policies specifically targeting this agent
  const targetedPolicies = state.policies.filter(
    (p) => p.applies_to_agent_principal_id === agentPrincipalId,
  );
  for (const p of targetedPolicies) {
    try { store.policies.delete(p.policy_id); } catch { /* already gone */ }
    summary.policies_removed++;
  }

  // Delete approval requests referencing this agent
  const approvalRequests = (state.approval_requests ?? []).filter(
    (ar) => ar.agent_principal_id === agentPrincipalId,
  );
  for (const ar of approvalRequests) {
    try { store.approvalRequests.delete(ar.approval_request_id); } catch { /* skip */ }
    summary.approval_requests_removed++;
  }

  // Delete policy drafts referencing this agent
  const policyDrafts = (state.policy_drafts ?? []).filter(
    (pd) => pd.agent_principal_id === agentPrincipalId,
  );
  for (const pd of policyDrafts) {
    try { store.policyDrafts.delete(pd.policy_draft_id); } catch { /* skip */ }
    summary.policy_drafts_removed++;
  }

  // Delete agent file
  try { store.agents.delete(agentPrincipalId); } catch { /* already gone */ }

  // Update state index atomically
  store.state.updateState((s) => {
    s.agents = s.agents.filter((a) => a.agent_principal_id !== agentPrincipalId);
    const removedPolicyIds = new Set(targetedPolicies.map((p) => p.policy_id));
    s.policies = s.policies.filter((p) => !removedPolicyIds.has(p.policy_id));
    // Remove bindings for deleted policies AND bindings targeting this agent
    const beforeBindings = s.bindings.length;
    s.bindings = s.bindings.filter(
      (b) => !removedPolicyIds.has(b.policy_id) && b.applies_to_agent_principal_id !== agentPrincipalId,
    );
    summary.bindings_removed = beforeBindings - s.bindings.length;
    if (s.approval_requests) {
      s.approval_requests = s.approval_requests.filter(
        (ar) => ar.agent_principal_id !== agentPrincipalId,
      );
    }
    if (s.policy_drafts) {
      s.policy_drafts = s.policy_drafts.filter(
        (pd) => pd.agent_principal_id !== agentPrincipalId,
      );
    }
  });

  return summary;
}

/**
 * Delete an organization and all dependent data:
 * - All org memberships
 * - All org agents (cascading)
 * - All org policies + bindings
 * - All org invites
 * - All org approval requests + policy drafts
 * - Organization file
 */
export function cascadeDeleteOrg(store: DataStore, orgId: string): CascadeSummary {
  const summary = emptySummary();
  const state = store.state.getState();

  // Delete all agents owned by this org (cascading)
  const orgAgents = state.agents.filter((a) => a.owner_type === "org" && a.owner_id === orgId);
  for (const a of orgAgents) {
    const agentSummary = cascadeDeleteAgent(store, a.agent_principal_id);
    summary.agents_removed++;
    summary.policies_removed += agentSummary.policies_removed;
    summary.bindings_removed += agentSummary.bindings_removed;
    summary.approval_requests_removed += agentSummary.approval_requests_removed;
    summary.policy_drafts_removed += agentSummary.policy_drafts_removed;
  }

  // Re-read state after agent cascades
  const freshState = store.state.getState();

  // Delete remaining org policies (not already removed by agent cascade)
  const orgPolicies = freshState.policies.filter(
    (p) => p.owner_type === "org" && p.owner_id === orgId,
  );
  for (const p of orgPolicies) {
    try { store.policies.delete(p.policy_id); } catch { /* skip */ }
    summary.policies_removed++;
  }

  // Delete memberships
  const memberships = store.memberships.listByOrg(orgId);
  for (const m of memberships) {
    store.memberships.delete(m.membership_id);
    summary.memberships_removed++;
  }

  // Delete org invites
  const orgInvites = store.orgInvites.listByOrg(orgId);
  for (const inv of orgInvites) {
    store.orgInvites.delete(inv.invite_id);
    summary.org_invites_removed++;
  }

  // Delete remaining approval requests for this org
  const orgApprovals = (freshState.approval_requests ?? []).filter(
    (ar) => ar.owner_type === "org" && ar.owner_id === orgId,
  );
  for (const ar of orgApprovals) {
    try { store.approvalRequests.delete(ar.approval_request_id); } catch { /* skip */ }
    summary.approval_requests_removed++;
  }

  // Delete remaining policy drafts for this org
  const orgDrafts = (freshState.policy_drafts ?? []).filter(
    (pd) => pd.owner_type === "org" && pd.owner_id === orgId,
  );
  for (const pd of orgDrafts) {
    try { store.policyDrafts.delete(pd.policy_draft_id); } catch { /* skip */ }
    summary.policy_drafts_removed++;
  }

  // Delete org file
  try { store.organizations.delete(orgId); } catch { /* skip */ }

  // Update state index atomically
  store.state.updateState((s) => {
    s.organizations = s.organizations.filter((o) => o.org_id !== orgId);
    s.memberships = s.memberships.filter((m) => m.org_id !== orgId);
    const removedPolicyIds = new Set(orgPolicies.map((p) => p.policy_id));
    s.policies = s.policies.filter((p) => !removedPolicyIds.has(p.policy_id));
    const beforeBindings = s.bindings.length;
    s.bindings = s.bindings.filter(
      (b) => !(b.owner_type === "org" && b.owner_id === orgId),
    );
    summary.bindings_removed += beforeBindings - s.bindings.length;
    if (s.approval_requests) {
      s.approval_requests = s.approval_requests.filter(
        (ar) => !(ar.owner_type === "org" && ar.owner_id === orgId),
      );
    }
    if (s.policy_drafts) {
      s.policy_drafts = s.policy_drafts.filter(
        (pd) => !(pd.owner_type === "org" && pd.owner_id === orgId),
      );
    }
  });

  return summary;
}

/**
 * Delete a user/owner and all dependent data:
 * - All user's agents (cascading)
 * - All user's policies + bindings
 * - All user's memberships
 * - All org invites targeting this user
 * - All setup invites for this user
 * - All user approval requests + policy drafts
 * - User file
 */
export function cascadeDeleteUser(store: DataStore, userId: string): CascadeSummary {
  const summary = emptySummary();
  const state = store.state.getState();

  // Delete all agents owned by this user (cascading)
  const userAgents = state.agents.filter((a) => a.owner_type === "user" && a.owner_id === userId);
  for (const a of userAgents) {
    const agentSummary = cascadeDeleteAgent(store, a.agent_principal_id);
    summary.agents_removed++;
    summary.policies_removed += agentSummary.policies_removed;
    summary.bindings_removed += agentSummary.bindings_removed;
    summary.approval_requests_removed += agentSummary.approval_requests_removed;
    summary.policy_drafts_removed += agentSummary.policy_drafts_removed;
  }

  // Re-read state after agent cascades
  const freshState = store.state.getState();

  // Delete remaining user policies (not already removed by agent cascade)
  const userPolicies = freshState.policies.filter(
    (p) => p.owner_type === "user" && p.owner_id === userId,
  );
  for (const p of userPolicies) {
    try { store.policies.delete(p.policy_id); } catch { /* skip */ }
    summary.policies_removed++;
  }

  // Delete memberships
  const memberships = store.memberships.listByUser(userId);
  for (const m of memberships) {
    store.memberships.delete(m.membership_id);
    summary.memberships_removed++;
  }

  // Delete org invites targeting this user
  const orgInvites = store.orgInvites.listByUser(userId);
  for (const inv of orgInvites) {
    store.orgInvites.delete(inv.invite_id);
    summary.org_invites_removed++;
  }

  // Delete remaining approval requests for this user
  const userApprovals = (freshState.approval_requests ?? []).filter(
    (ar) => ar.owner_type === "user" && ar.owner_id === userId,
  );
  for (const ar of userApprovals) {
    try { store.approvalRequests.delete(ar.approval_request_id); } catch { /* skip */ }
    summary.approval_requests_removed++;
  }

  // Delete remaining policy drafts for this user
  const userDrafts = (freshState.policy_drafts ?? []).filter(
    (pd) => pd.owner_type === "user" && pd.owner_id === userId,
  );
  for (const pd of userDrafts) {
    try { store.policyDrafts.delete(pd.policy_draft_id); } catch { /* skip */ }
    summary.policy_drafts_removed++;
  }

  // Delete user file
  try { store.users.delete(userId); } catch { /* skip */ }

  // Update state index atomically
  store.state.updateState((s) => {
    s.users = s.users.filter((u) => u.user_principal_id !== userId);
    s.memberships = s.memberships.filter((m) => m.user_principal_id !== userId);
    const removedPolicyIds = new Set(userPolicies.map((p) => p.policy_id));
    s.policies = s.policies.filter((p) => !removedPolicyIds.has(p.policy_id));
    const beforeBindings = s.bindings.length;
    s.bindings = s.bindings.filter(
      (b) => !(b.owner_type === "user" && b.owner_id === userId),
    );
    summary.bindings_removed += beforeBindings - s.bindings.length;
    if (s.approval_requests) {
      s.approval_requests = s.approval_requests.filter(
        (ar) => !(ar.owner_type === "user" && ar.owner_id === userId),
      );
    }
    if (s.policy_drafts) {
      s.policy_drafts = s.policy_drafts.filter(
        (pd) => !(pd.owner_type === "user" && pd.owner_id === userId),
      );
    }
  });

  return summary;
}
