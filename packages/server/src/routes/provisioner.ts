import * as crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashPassphrase } from '@openleash/core';
import type { DataStore, Provisioner } from '@openleash/core';
import { createProvisionerAuth } from '../middleware/provisioner-auth.js';
import { nextRankInTier } from './owner.js';

const ENROLLMENT_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function requestProvisioner(request: FastifyRequest): Provisioner {
  return (request as unknown as Record<string, unknown>).provisioner as Provisioner;
}

function requestBaseUrl(request: FastifyRequest): string {
  const proto = request.headers['x-forwarded-proto'] || request.protocol;
  const host = request.headers['x-forwarded-host'] || request.hostname;
  const port = (request.headers['x-forwarded-port'] as string | undefined)
    || (request.socket.localPort !== 80 && request.socket.localPort !== 443
      ? String(request.socket.localPort)
      : undefined);
  return `${proto}://${host}${port ? ':' + port : ''}`;
}

/**
 * Provisioner scope: endpoints for machine principals (agent launchpads,
 * CI pipelines) that enroll agents on an owner's behalf. Authenticated by
 * `createProvisionerAuth` — a scoped bearer token minted by the owner via
 * POST /v1/owner/provisioners.
 */
export function registerProvisionerRoutes(app: FastifyInstance, store: DataStore) {
  const provisionerAuth = createProvisionerAuth(store);

  // GET /v1/provisioner/self — identity probe ("test connection")
  app.get('/v1/provisioner/self', { preHandler: provisionerAuth }, async (request) => {
    const provisioner = requestProvisioner(request);
    return {
      provisioner_id: provisioner.provisioner_id,
      name: provisioner.name,
      owner_type: provisioner.owner_type,
      owner_id: provisioner.owner_id,
      status: provisioner.status,
      created_at: provisioner.created_at,
    };
  });

  // GET /v1/provisioner/policies — owner policies referencable in enrollments
  app.get('/v1/provisioner/policies', { preHandler: provisionerAuth }, async (request) => {
    const provisioner = requestProvisioner(request);
    const state = store.state.getState();
    const policies = state.policies
      .filter(
        (p) =>
          p.owner_type === provisioner.owner_type && p.owner_id === provisioner.owner_id,
      )
      .map((p) => ({
        policy_id: p.policy_id,
        name: p.name,
        description: p.description,
        applies_to_agent_principal_id: p.applies_to_agent_principal_id,
        applies_to_group_id: p.applies_to_group_id ?? null,
      }));
    return { policies };
  });

  /** Read a policy group and 404/400-check it belongs to this provisioner's owner. */
  function ownedGroupOrReply(
    provisioner: Provisioner,
    groupId: string,
    reply: FastifyReply,
  ): { group_id: string } | null {
    let group;
    try {
      group = store.policyGroups.read(groupId);
    } catch {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy group not found' } });
      return null;
    }
    if (group.owner_type !== provisioner.owner_type || group.owner_id !== provisioner.owner_id) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy group not found' } });
      return null;
    }
    return group;
  }

  /** Find an agent state entry owned by this provisioner's owner, or 404. */
  function ownedAgentOrReply(
    provisioner: Provisioner,
    agentPrincipalId: string,
    reply: FastifyReply,
  ): { agent_principal_id: string; agent_id: string } | null {
    const entry = store.state
      .getState()
      .agents.find((a) => a.agent_principal_id === agentPrincipalId);
    if (!entry || entry.owner_type !== provisioner.owner_type || entry.owner_id !== provisioner.owner_id) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found for this owner' } });
      return null;
    }
    return entry;
  }

  // POST /v1/provisioner/enrollments — mint a single-use agent invite
  app.post('/v1/provisioner/enrollments', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const body = (request.body ?? {}) as { agent_name?: unknown; policy_id?: unknown; group_id?: unknown };

    const agentName = typeof body.agent_name === 'string' ? body.agent_name.trim() : '';
    if (!agentName) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'agent_name is required' },
      });
      return;
    }

    let policyId: string | null = null;
    if (body.policy_id !== undefined && body.policy_id !== null && body.policy_id !== '') {
      if (typeof body.policy_id !== 'string') {
        reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'policy_id must be a string' },
        });
        return;
      }
      const state = store.state.getState();
      const policy = state.policies.find(
        (p) =>
          p.policy_id === body.policy_id &&
          p.owner_type === provisioner.owner_type &&
          p.owner_id === provisioner.owner_id,
      );
      if (!policy) {
        reply.code(400).send({
          error: { code: 'INVALID_POLICY', message: 'policy_id does not reference a policy of this owner' },
        });
        return;
      }
      policyId = policy.policy_id;
    }

    let groupId: string | null = null;
    if (body.group_id !== undefined && body.group_id !== null && body.group_id !== '') {
      if (typeof body.group_id !== 'string') {
        reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: 'group_id must be a string' },
        });
        return;
      }
      let group;
      try {
        group = store.policyGroups.read(body.group_id);
      } catch {
        group = null;
      }
      if (!group || group.owner_type !== provisioner.owner_type || group.owner_id !== provisioner.owner_id) {
        reply.code(400).send({
          error: { code: 'INVALID_GROUP', message: 'group_id does not reference a policy group of this owner' },
        });
        return;
      }
      groupId = group.group_id;
    }

    const inviteToken = crypto.randomBytes(32).toString('base64url');
    const inviteId = crypto.randomUUID();
    const { hash, salt } = hashPassphrase(inviteToken);
    const now = Date.now();
    const expiresAt = new Date(now + ENROLLMENT_INVITE_TTL_MS).toISOString();

    store.agentInvites.write({
      invite_id: inviteId,
      owner_type: provisioner.owner_type,
      owner_id: provisioner.owner_id,
      token_hash: hash,
      token_salt: salt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
      created_at: new Date(now).toISOString(),
      provisioner_id: provisioner.provisioner_id,
      agent_name: agentName,
      bind_policy_id: policyId,
      bind_group_id: groupId,
      agent_principal_id: null,
    });

    store.audit.append('PROVISIONER_ENROLLMENT_CREATED', {
      provisioner_id: provisioner.provisioner_id,
      owner_type: provisioner.owner_type,
      owner_id: provisioner.owner_id,
      invite_id: inviteId,
      agent_name: agentName,
      bind_policy_id: policyId,
      bind_group_id: groupId,
    });

    const baseUrl = requestBaseUrl(request);
    return {
      enrollment_id: inviteId,
      invite_id: inviteId,
      invite_token: inviteToken,
      invite_url: `${baseUrl}/v1/agents/register-with-invite?invite_id=${inviteId}&invite_token=${inviteToken}`,
      expires_at: expiresAt,
      agent_name: agentName,
      policy_id: policyId,
      group_id: groupId,
    };
  });

  // GET /v1/provisioner/enrollments — list this provisioner's enrollments
  app.get('/v1/provisioner/enrollments', { preHandler: provisionerAuth }, async (request) => {
    const provisioner = requestProvisioner(request);
    const state = store.state.getState();
    const agentsById = new Map(state.agents.map((a) => [a.agent_principal_id, a]));

    const enrollments = store.agentInvites
      .list()
      .filter((invite) => invite.provisioner_id === provisioner.provisioner_id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((invite) => {
        const agentEntry = invite.agent_principal_id
          ? agentsById.get(invite.agent_principal_id)
          : undefined;
        const status = invite.used
          ? 'used'
          : Date.parse(invite.expires_at) < Date.now()
            ? 'expired'
            : 'pending';
        return {
          enrollment_id: invite.invite_id,
          agent_name: invite.agent_name ?? null,
          policy_id: invite.bind_policy_id ?? null,
          group_id: invite.bind_group_id ?? null,
          status,
          created_at: invite.created_at,
          expires_at: invite.expires_at,
          used_at: invite.used_at,
          agent: agentEntry
            ? { agent_principal_id: agentEntry.agent_principal_id, agent_id: agentEntry.agent_id }
            : null,
        };
      });

    return { enrollments };
  });

  // GET /v1/provisioner/agents — the owner's agents, for post-enrollment management
  app.get('/v1/provisioner/agents', { preHandler: provisionerAuth }, async (request) => {
    const provisioner = requestProvisioner(request);
    const agents = store.state
      .getState()
      .agents.filter(
        (a) => a.owner_type === provisioner.owner_type && a.owner_id === provisioner.owner_id,
      )
      .map((entry) => {
        let status: string | null = null;
        let createdAt: string | null = null;
        try {
          const agent = store.agents.read(entry.agent_principal_id);
          status = agent.status;
          createdAt = agent.created_at;
        } catch {
          // index entry without a readable file — expose what the index has
        }
        return {
          agent_principal_id: entry.agent_principal_id,
          agent_id: entry.agent_id,
          status,
          created_at: createdAt,
        };
      });
    return { agents };
  });

  // GET /v1/provisioner/groups — the owner's policy groups (org owners only;
  // groups are org-scoped, so user-owned provisioners always see an empty list)
  app.get('/v1/provisioner/groups', { preHandler: provisionerAuth }, async (request) => {
    const provisioner = requestProvisioner(request);
    if (provisioner.owner_type !== 'org') {
      return { groups: [] };
    }
    const groups = store.policyGroups.listByOwner('org', provisioner.owner_id).map((g) => ({
      group_id: g.group_id,
      name: g.name,
      slug: g.slug,
      description: g.description,
      created_at: g.created_at,
      member_count: store.agentGroupMemberships.listByGroup(g.group_id).length,
    }));
    return { groups };
  });

  // POST /v1/provisioner/groups/:groupId/agents/:agentPrincipalId — idempotent add
  app.post('/v1/provisioner/groups/:groupId/agents/:agentPrincipalId', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const { groupId, agentPrincipalId } = request.params as { groupId: string; agentPrincipalId: string };

    const group = ownedGroupOrReply(provisioner, groupId, reply);
    if (!group) return;
    const agent = ownedAgentOrReply(provisioner, agentPrincipalId, reply);
    if (!agent) return;

    const existing = store.agentGroupMemberships
      .listByGroup(groupId)
      .find((m) => m.agent_principal_id === agentPrincipalId);
    if (existing) {
      return { membership_id: existing.membership_id, status: 'already_member' };
    }

    const membershipId = crypto.randomUUID();
    store.agentGroupMemberships.write({
      membership_id: membershipId,
      group_id: groupId,
      agent_principal_id: agentPrincipalId,
      added_at: new Date().toISOString(),
      added_by_user_id: provisioner.provisioner_id,
    });
    store.state.updateState((s) => {
      if (!s.agent_group_memberships) s.agent_group_memberships = [];
      s.agent_group_memberships.push({
        membership_id: membershipId,
        group_id: groupId,
        agent_principal_id: agentPrincipalId,
        path: `./agent-group-memberships/${membershipId}.json`,
      });
    });

    store.audit.append('POLICY_GROUP_AGENT_ADDED', {
      group_id: groupId,
      org_id: provisioner.owner_id,
      agent_principal_id: agentPrincipalId,
      membership_id: membershipId,
      provisioner_id: provisioner.provisioner_id,
    });

    return { membership_id: membershipId, status: 'added' };
  });

  // DELETE /v1/provisioner/groups/:groupId/agents/:agentPrincipalId
  app.delete('/v1/provisioner/groups/:groupId/agents/:agentPrincipalId', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const { groupId, agentPrincipalId } = request.params as { groupId: string; agentPrincipalId: string };

    const group = ownedGroupOrReply(provisioner, groupId, reply);
    if (!group) return;

    const existing = store.agentGroupMemberships
      .listByGroup(groupId)
      .find((m) => m.agent_principal_id === agentPrincipalId);
    if (!existing) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Agent is not a member of this group' } });
      return;
    }

    store.agentGroupMemberships.delete(existing.membership_id);
    store.state.updateState((s) => {
      if (s.agent_group_memberships) {
        s.agent_group_memberships = s.agent_group_memberships.filter(
          (e) => e.membership_id !== existing.membership_id,
        );
      }
    });

    store.audit.append('POLICY_GROUP_AGENT_REMOVED', {
      group_id: groupId,
      org_id: provisioner.owner_id,
      agent_principal_id: agentPrincipalId,
      membership_id: existing.membership_id,
      provisioner_id: provisioner.provisioner_id,
    });

    return { membership_id: existing.membership_id, status: 'removed' };
  });

  // GET /v1/provisioner/agents/:agentPrincipalId/policies — the agent's
  // agent-tier policy bindings and group memberships
  app.get('/v1/provisioner/agents/:agentPrincipalId/policies', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const { agentPrincipalId } = request.params as { agentPrincipalId: string };

    const agent = ownedAgentOrReply(provisioner, agentPrincipalId, reply);
    if (!agent) return;

    const state = store.state.getState();
    const policyNames = new Map(state.policies.map((p) => [p.policy_id, p.name ?? null]));
    const policies = state.bindings
      .filter(
        (b) =>
          b.owner_type === provisioner.owner_type &&
          b.owner_id === provisioner.owner_id &&
          b.applies_to_agent_principal_id === agentPrincipalId,
      )
      .map((b) => ({
        policy_id: b.policy_id,
        name: policyNames.get(b.policy_id) ?? null,
        rank: b.rank ?? null,
      }));

    const groups = store.agentGroupMemberships.listByAgent(agentPrincipalId).map((m) => {
      let name: string | null = null;
      try {
        name = store.policyGroups.read(m.group_id).name;
      } catch {
        // group deleted; membership is stale but still listed
      }
      return { group_id: m.group_id, name, membership_id: m.membership_id };
    });

    return { agent_principal_id: agentPrincipalId, policies, groups };
  });

  // POST /v1/provisioner/agents/:agentPrincipalId/policies — bind an existing
  // owner policy to the agent (same agent-tier binding an enrollment's
  // policy_id creates at redemption). Idempotent.
  app.post('/v1/provisioner/agents/:agentPrincipalId/policies', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const { agentPrincipalId } = request.params as { agentPrincipalId: string };
    const body = (request.body ?? {}) as { policy_id?: unknown };

    const agent = ownedAgentOrReply(provisioner, agentPrincipalId, reply);
    if (!agent) return;

    if (typeof body.policy_id !== 'string' || body.policy_id === '') {
      reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'policy_id is required' } });
      return;
    }
    const policyId = body.policy_id;
    const state = store.state.getState();
    const policy = state.policies.find(
      (p) =>
        p.policy_id === policyId &&
        p.owner_type === provisioner.owner_type &&
        p.owner_id === provisioner.owner_id,
    );
    if (!policy) {
      reply.code(400).send({
        error: { code: 'INVALID_POLICY', message: 'policy_id does not reference a policy of this owner' },
      });
      return;
    }

    const alreadyBound = state.bindings.some(
      (b) =>
        b.owner_type === provisioner.owner_type &&
        b.owner_id === provisioner.owner_id &&
        b.policy_id === policyId &&
        b.applies_to_agent_principal_id === agentPrincipalId,
    );
    if (alreadyBound) {
      return { policy_id: policyId, agent_principal_id: agentPrincipalId, status: 'already_bound' };
    }

    store.state.updateState((s) => {
      const rank = nextRankInTier(s.bindings, {
        owner_type: provisioner.owner_type,
        owner_id: provisioner.owner_id,
        tier: 'agent',
      });
      s.bindings.push({
        owner_type: provisioner.owner_type,
        owner_id: provisioner.owner_id,
        policy_id: policyId,
        applies_to_agent_principal_id: agentPrincipalId,
        applies_to_group_id: null,
        rank,
      });
    });

    store.audit.append('PROVISIONER_POLICY_BOUND', {
      provisioner_id: provisioner.provisioner_id,
      owner_type: provisioner.owner_type,
      owner_id: provisioner.owner_id,
      policy_id: policyId,
      agent_principal_id: agentPrincipalId,
    });

    return { policy_id: policyId, agent_principal_id: agentPrincipalId, status: 'bound' };
  });

  // DELETE /v1/provisioner/agents/:agentPrincipalId/policies/:policyId —
  // remove the agent-tier binding (the policy itself is untouched)
  app.delete('/v1/provisioner/agents/:agentPrincipalId/policies/:policyId', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const { agentPrincipalId, policyId } = request.params as { agentPrincipalId: string; policyId: string };

    const agent = ownedAgentOrReply(provisioner, agentPrincipalId, reply);
    if (!agent) return;

    const bound = store.state
      .getState()
      .bindings.some(
        (b) =>
          b.owner_type === provisioner.owner_type &&
          b.owner_id === provisioner.owner_id &&
          b.policy_id === policyId &&
          b.applies_to_agent_principal_id === agentPrincipalId,
      );
    if (!bound) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Policy is not bound to this agent' } });
      return;
    }

    store.state.updateState((s) => {
      s.bindings = s.bindings.filter(
        (b) =>
          !(
            b.owner_type === provisioner.owner_type &&
            b.owner_id === provisioner.owner_id &&
            b.policy_id === policyId &&
            b.applies_to_agent_principal_id === agentPrincipalId
          ),
      );
    });

    store.audit.append('PROVISIONER_POLICY_UNBOUND', {
      provisioner_id: provisioner.provisioner_id,
      owner_type: provisioner.owner_type,
      owner_id: provisioner.owner_id,
      policy_id: policyId,
      agent_principal_id: agentPrincipalId,
    });

    return { policy_id: policyId, agent_principal_id: agentPrincipalId, status: 'unbound' };
  });
}
