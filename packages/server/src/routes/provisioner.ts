import * as crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashPassphrase } from '@openleash/core';
import type { DataStore, Provisioner } from '@openleash/core';
import { createProvisionerAuth } from '../middleware/provisioner-auth.js';

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

  // POST /v1/provisioner/enrollments — mint a single-use agent invite
  app.post('/v1/provisioner/enrollments', { preHandler: provisionerAuth }, async (request, reply) => {
    const provisioner = requestProvisioner(request);
    const body = (request.body ?? {}) as { agent_name?: unknown; policy_id?: unknown };

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
      agent_principal_id: null,
    });

    store.audit.append('PROVISIONER_ENROLLMENT_CREATED', {
      provisioner_id: provisioner.provisioner_id,
      owner_type: provisioner.owner_type,
      owner_id: provisioner.owner_id,
      invite_id: inviteId,
      agent_name: agentName,
      bind_policy_id: policyId,
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
}
