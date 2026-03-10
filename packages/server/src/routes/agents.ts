import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  writeState,
  writeAgentFile,
  readAgentInviteFile,
  writeAgentInviteFile,
  appendAuditEvent,
  hashPassphrase,
} from '@openleash/core';
import type { RegistrationChallenge } from '@openleash/core';

// In-memory challenge store
const challenges = new Map<string, RegistrationChallenge>();

// Cleanup expired challenges every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of challenges) {
    if (new Date(ch.expires_at).getTime() < now) {
      challenges.delete(id);
    }
  }
}, 60_000).unref();

export function registerAgentRoutes(app: FastifyInstance, dataDir: string) {
  // POST /v1/agents/registration-challenge
  app.post('/v1/agents/registration-challenge', async (request, reply) => {
    const body = request.body as {
      agent_id: string;
      agent_pubkey_b64: string;
      owner_principal_id?: string;
      agent_attributes_json?: Record<string, unknown>;
    };

    if (!body.agent_id || !body.agent_pubkey_b64) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'agent_id and agent_pubkey_b64 are required' },
      });
      return;
    }

    const challengeBytes = crypto.randomBytes(32);
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const challenge: RegistrationChallenge = {
      challenge_id: challengeId,
      challenge_b64: challengeBytes.toString('base64'),
      agent_id: body.agent_id,
      agent_pubkey_b64: body.agent_pubkey_b64,
      owner_principal_id: body.owner_principal_id,
      agent_attributes_json: body.agent_attributes_json,
      expires_at: expiresAt,
    };

    challenges.set(challengeId, challenge);

    appendAuditEvent(dataDir, 'AGENT_CHALLENGE_ISSUED', {
      challenge_id: challengeId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id ?? null,
      expires_at: expiresAt,
    });

    return {
      challenge_id: challengeId,
      challenge_b64: challengeBytes.toString('base64'),
      expires_at: expiresAt,
    };
  });

  // POST /v1/agents/register
  app.post('/v1/agents/register', async (request, reply) => {
    const body = request.body as {
      challenge_id: string;
      agent_id: string;
      agent_pubkey_b64: string;
      signature_b64: string;
      owner_principal_id: string;
      agent_attributes_json?: Record<string, unknown>;
    };

    if (!body.challenge_id || !body.agent_id || !body.agent_pubkey_b64 || !body.signature_b64 || !body.owner_principal_id) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
      });
      return;
    }

    // Look up challenge
    const challenge = challenges.get(body.challenge_id);
    if (!challenge) {
      reply.code(400).send({
        error: { code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found or expired' },
      });
      return;
    }

    // Check expiry
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      challenges.delete(body.challenge_id);
      reply.code(400).send({
        error: { code: 'CHALLENGE_EXPIRED', message: 'Challenge has expired' },
      });
      return;
    }

    // Verify signature over challenge bytes
    const challengeBytes = Buffer.from(challenge.challenge_b64, 'base64');
    const signature = Buffer.from(body.signature_b64, 'base64');
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(body.agent_pubkey_b64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const valid = crypto.verify(null, challengeBytes, publicKey, signature);
    if (!valid) {
      reply.code(401).send({
        error: { code: 'INVALID_SIGNATURE', message: 'Challenge signature verification failed' },
      });
      return;
    }

    // Clean up challenge
    challenges.delete(body.challenge_id);

    // Create agent
    const agentPrincipalId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    writeAgentFile(dataDir, {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      public_key_b64: body.agent_pubkey_b64,
      status: 'ACTIVE',
      attributes: body.agent_attributes_json ?? {},
      created_at: createdAt,
      revoked_at: null,
    });

    // Update state.md
    const state = readState(dataDir);
    state.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      path: `./agents/${agentPrincipalId}.md`,
    });
    writeState(dataDir, state);

    appendAuditEvent(dataDir, 'AGENT_REGISTERED', {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      agent_attributes_json: body.agent_attributes_json ?? null,
    });

    return {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      status: 'ACTIVE',
      created_at: createdAt,
    };
  });

  // GET /v1/agents/register-with-invite — returns registration instructions
  app.get('/v1/agents/register-with-invite', async (request, reply) => {
    const query = request.query as { invite_id?: string; invite_token?: string };

    if (!query.invite_id || !query.invite_token) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Missing invite_id or invite_token query parameters' },
      });
      return;
    }

    const proto = request.headers['x-forwarded-proto'] || request.protocol;
    const host = request.headers['x-forwarded-host'] || request.hostname;
    const port = (request.headers['x-forwarded-port'] as string | undefined)
      || (request.socket.localPort !== 80 && request.socket.localPort !== 443
        ? String(request.socket.localPort)
        : undefined);
    const baseUrl = `${proto}://${host}${port ? ':' + port : ''}`;
    const registerUrl = `${baseUrl}/v1/agents/register-with-invite`;

    return {
      message: 'OpenLeash Agent Registration',
      instructions: 'To register, POST to this URL with your agent_id and agent_pubkey_b64. The invite_id and invite_token from the query parameters will be used automatically.',
      register_url: registerUrl,
      method: 'POST',
      required_body: {
        invite_id: query.invite_id,
        invite_token: query.invite_token,
        agent_id: '(your agent identifier)',
        agent_pubkey_b64: '(your Ed25519 public key, base64-encoded SPKI/DER format)',
      },
      example_curl: `curl -X POST ${registerUrl} -H "Content-Type: application/json" -d '{"invite_id":"${query.invite_id}","invite_token":"${query.invite_token}","agent_id":"my-agent","agent_pubkey_b64":"<BASE64_PUBLIC_KEY>"}'`,
      sdks: {
        typescript: {
          package: '@openleash/sdk-ts',
          install: 'npm install @openleash/sdk-ts',
          example: `import { redeemAgentInvite } from '@openleash/sdk-ts';\nconst agent = await redeemAgentInvite({ inviteUrl: '${baseUrl}/v1/agents/register-with-invite?invite_id=${query.invite_id}&invite_token=${query.invite_token}', agentId: 'my-agent' });`,
        },
        python: {
          package: 'openleash-sdk',
          install: 'pip install openleash-sdk',
          example: `from openleash import redeem_agent_invite\nagent = await redeem_agent_invite(invite_url='${baseUrl}/v1/agents/register-with-invite?invite_id=${query.invite_id}&invite_token=${query.invite_token}', agent_id='my-agent')`,
        },
      },
    };
  });

  // POST /v1/agents/register-with-invite
  app.post('/v1/agents/register-with-invite', async (request, reply) => {
    const body = request.body as {
      invite_id: string;
      invite_token: string;
      agent_id: string;
      agent_pubkey_b64: string;
    };
    const query = request.query as { invite_id?: string; invite_token?: string };

    // Accept invite_id and invite_token from either body or query params
    const inviteId = body.invite_id || query.invite_id;
    const inviteToken = body.invite_token || query.invite_token;

    if (!inviteId || !inviteToken || !body.agent_id || !body.agent_pubkey_b64) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'invite_id, invite_token, agent_id, and agent_pubkey_b64 are required' },
      });
      return;
    }

    // Validate the public key format
    try {
      crypto.createPublicKey({
        key: Buffer.from(body.agent_pubkey_b64, 'base64'),
        format: 'der',
        type: 'spki',
      });
    } catch {
      reply.code(400).send({
        error: { code: 'INVALID_KEY', message: 'Invalid public key format (expected base64 SPKI/DER Ed25519 key)' },
      });
      return;
    }

    // Load invite
    let invite;
    try {
      invite = readAgentInviteFile(dataDir, inviteId);
    } catch {
      reply.code(404).send({
        error: { code: 'INVITE_NOT_FOUND', message: 'Agent invite not found' },
      });
      return;
    }

    if (invite.used) {
      reply.code(400).send({
        error: { code: 'INVITE_USED', message: 'Agent invite has already been used' },
      });
      return;
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      reply.code(400).send({
        error: { code: 'INVITE_EXPIRED', message: 'Agent invite has expired' },
      });
      return;
    }

    // Verify invite token
    const { hash: computedHash } = hashPassphrase(inviteToken, invite.token_salt);
    if (computedHash !== invite.token_hash) {
      reply.code(401).send({
        error: { code: 'INVALID_INVITE_TOKEN', message: 'Invalid invite token' },
      });
      return;
    }

    // Create the agent
    const agentPrincipalId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    writeAgentFile(dataDir, {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: invite.owner_principal_id,
      public_key_b64: body.agent_pubkey_b64,
      status: 'ACTIVE',
      attributes: {},
      created_at: createdAt,
      revoked_at: null,
    });

    // Update state
    const state = readState(dataDir);
    state.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: invite.owner_principal_id,
      path: `./agents/${agentPrincipalId}.md`,
    });
    writeState(dataDir, state);

    // Mark invite as used
    invite.used = true;
    invite.used_at = createdAt;
    writeAgentInviteFile(dataDir, invite);

    appendAuditEvent(dataDir, 'AGENT_REGISTERED_VIA_INVITE', {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: invite.owner_principal_id,
      invite_id: inviteId,
    });

    // Derive the base URL from the request
    const proto = request.headers['x-forwarded-proto'] || request.protocol;
    const host = request.headers['x-forwarded-host'] || request.hostname;
    const port = (request.headers['x-forwarded-port'] as string | undefined)
      || (request.socket.localPort !== 80 && request.socket.localPort !== 443
        ? String(request.socket.localPort)
        : undefined);
    const baseUrl = `${proto}://${host}${port ? ':' + port : ''}`;

    return {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: invite.owner_principal_id,
      status: 'ACTIVE',
      created_at: createdAt,
      openleash_url: baseUrl,
      auth: {
        method: 'ed25519_signed_request',
        key_format: 'base64 SPKI/DER (public) and PKCS8/DER (private)',
        headers: {
          'X-Agent-Id': body.agent_id,
          'X-Timestamp': 'ISO 8601 timestamp',
          'X-Nonce': 'UUID v4',
          'X-Body-Sha256': 'hex-encoded SHA-256 of request body',
          'X-Signature': 'base64-encoded Ed25519 signature',
        },
        signing_input: 'METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nBODY_SHA256',
      },
      endpoints: {
        authorize: {
          method: 'POST',
          path: '/v1/authorize',
          description: 'Submit an action for authorization. Returns a decision (ALLOW/DENY/REQUIRE_APPROVAL) and a proof token on ALLOW.',
        },
        create_approval_request: {
          method: 'POST',
          path: '/v1/agent/approval-requests',
          description: 'Request human approval when a decision requires it.',
        },
        get_approval_request: {
          method: 'GET',
          path: '/v1/agent/approval-requests/{approval_request_id}',
          description: 'Poll the status of an approval request. Returns approval_token when approved.',
        },
        health: {
          method: 'GET',
          path: '/v1/health',
          description: 'Server health check (no auth required).',
        },
        public_keys: {
          method: 'GET',
          path: '/v1/public-keys',
          description: 'Retrieve server public keys for offline proof verification (no auth required).',
        },
        verify_proof: {
          method: 'POST',
          path: '/v1/verify-proof',
          description: 'Verify a proof token online (no auth required).',
        },
      },
      sdks: {
        typescript: { package: '@openleash/sdk-ts', install: 'npm install @openleash/sdk-ts' },
        python: { package: 'openleash-sdk', install: 'pip install openleash-sdk' },
        go: { module: 'github.com/openleash/openleash/packages/sdk-go', install: 'go get github.com/openleash/openleash/packages/sdk-go' },
      },
    };
  });
}
