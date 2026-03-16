import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  readState,
  writeState,
  writeAgentFile,
  readAgentFile,
  readAgentInviteFile,
  writeAgentInviteFile,
  appendAuditEvent,
  hashPassphrase,
  policyJsonSchema,
  ACTION_TAXONOMY,
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
      webhook_url: string;
      webhook_secret: string;
      webhook_auth_token: string;
    };

    if (!body.challenge_id || !body.agent_id || !body.agent_pubkey_b64 || !body.signature_b64 || !body.owner_principal_id) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'Missing required fields' },
      });
      return;
    }

    if (!body.webhook_url || !body.webhook_secret || !body.webhook_auth_token) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'webhook_url, webhook_secret, and webhook_auth_token are required' },
      });
      return;
    }

    // Validate webhook URL
    try {
      const parsed = new URL(body.webhook_url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('not http(s)');
      }
    } catch {
      reply.code(400).send({
        error: { code: 'INVALID_WEBHOOK_URL', message: 'webhook_url must be a valid HTTP or HTTPS URL' },
      });
      return;
    }

    // Enforce webhook URL uniqueness
    {
      const state = readState(dataDir);
      for (const entry of state.agents) {
        const existing = readAgentFile(dataDir, entry.agent_principal_id);
        if (existing.webhook_url === body.webhook_url) {
          reply.code(409).send({
            error: { code: 'WEBHOOK_URL_NOT_UNIQUE', message: 'An agent with this webhook_url already exists' },
          });
          return;
        }
      }
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
      webhook_url: body.webhook_url,
      webhook_secret: body.webhook_secret,
      webhook_auth_token: body.webhook_auth_token,
    });

    // Update state.md
    const state2 = readState(dataDir);
    state2.agents.push({
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      path: `./agents/${agentPrincipalId}.md`,
    });
    writeState(dataDir, state2);

    appendAuditEvent(dataDir, 'AGENT_REGISTERED', {
      agent_principal_id: agentPrincipalId,
      agent_id: body.agent_id,
      owner_principal_id: body.owner_principal_id,
      agent_attributes_json: body.agent_attributes_json ?? null,
      webhook_url: body.webhook_url,
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
      overview: 'OpenLeash is your authorization guardian. Before you take sensitive actions (purchases, emails, API calls, file operations), you ask OpenLeash for permission. Your owner — the human who created this invite — sets policies that govern what you can and cannot do. OpenLeash evaluates your request against those policies and returns a decision. This is the "ask before you act" paradigm: you MUST check authorization before performing any action that has real-world consequences.',
      how_it_works: [
        'Step 1: Register — POST to this URL with your credentials (see registration section below).',
        'Step 2: Policies govern your actions — Your owner can set policies through the dashboard, but you can also suggest policy drafts yourself. For example, if you notice your owner repeatedly approves the same type of action, you can propose a policy that pre-authorizes it. Study your owner\'s approval patterns and suggest drafts via POST /v1/agent/policy-drafts. Your owner always has the final say — they accept or refuse every draft. Read the policy schema (GET /v1/agents/policy-schema) to learn the YAML format.',
        'Step 3: Before every sensitive action, call POST /v1/authorize — Describe what you want to do (action type, payload, counterparty). OpenLeash evaluates your request against the active policy.',
        'Step 4: Respect the decision — ALLOW means proceed (you may receive a cryptographic proof token to present to counterparties). DENY means stop. REQUIRE_APPROVAL means pause and wait for your owner to approve.',
        'Step 5: If approval is required — Create an approval request via POST /v1/agent/approval-requests. Your owner will be notified. Poll GET /v1/agent/approval-requests/{id} or listen on your webhook for the result. Once approved, retry POST /v1/authorize with the approval_token.',
      ],
      registration: {
        instructions: 'To register, POST to the URL below. Generate a fresh Ed25519 keypair — send the public key here and keep the private key safe. You will sign every future request with it. The invite_id and invite_token from the query parameters will be used automatically.',
        url: registerUrl,
        method: 'POST',
        required_body: {
          invite_id: query.invite_id,
          invite_token: query.invite_token,
          agent_id: '(your agent identifier — a stable name like "shopping-agent" or "email-assistant")',
          agent_pubkey_b64: '(your Ed25519 public key, base64-encoded SPKI/DER format — generate a fresh keypair and keep the private key safe)',
          webhook_url: '(HTTP(S) URL where OpenLeash will POST decision notifications — approval results, policy draft decisions)',
          webhook_secret: '(shared secret for HMAC-SHA256 webhook signature verification — generate a random 32+ character string)',
          webhook_auth_token: '(Bearer token for webhook endpoint authentication — sent as Authorization: Bearer <token>)',
        },
        example_curl: `curl -X POST ${registerUrl} -H "Content-Type: application/json" -d '{"invite_id":"${query.invite_id}","invite_token":"${query.invite_token}","agent_id":"my-agent","agent_pubkey_b64":"<BASE64_PUBLIC_KEY>","webhook_url":"https://my-agent.example.com/webhook","webhook_secret":"your-hmac-secret","webhook_auth_token":"your-bearer-token"}'`,
      },
      authorization_flow: {
        description: 'This is your core integration point. Before taking any sensitive action, send an authorization request. All requests must be signed with your Ed25519 private key.',
        endpoint: 'POST /v1/authorize',
        request_body: {
          action_type: '(what you want to do — e.g. "commerce.purchase", "communication.email.send", "web.browse", "file.write")',
          payload: '(action-specific data — e.g. { "amount_minor": 5000, "currency": "USD", "merchant_domain": "amazon.com" })',
          relying_party: '(optional — the counterparty: { "name": "...", "domain": "...", "trust_profile": "HIGH|MEDIUM|LOW" })',
        },
        decisions: {
          ALLOW: {
            meaning: 'You are authorized. Proceed with the action.',
            proof_token: 'If the policy requires proof, the response includes a PASETO v4.public token. Present this token to counterparties as cryptographic evidence that you were authorized. The token has a TTL — use it before it expires.',
          },
          DENY: {
            meaning: 'You are NOT authorized. Do NOT proceed with the action. Inform the user or caller that the action was denied.',
            what_to_do: 'Stop. Do not attempt to bypass. You may explain to the user why the action was denied if the response includes a reason.',
          },
          REQUIRE_APPROVAL: {
            meaning: 'The action needs your owner\'s explicit approval before proceeding.',
            what_to_do: 'Create an approval request (POST /v1/agent/approval-requests), then wait. Do not proceed until you receive an approval_token. Your owner will review and approve or deny via the OpenLeash dashboard.',
            approval_flow: [
              '1. POST /v1/agent/approval-requests with { action_type, payload, justification }',
              '2. Wait — poll GET /v1/agent/approval-requests/{id} periodically, or listen on your webhook for approval_request.approved / approval_request.denied',
              '3. On approval: retry POST /v1/authorize including the approval_token in your request',
              '4. On denial: stop. Inform the user the action was denied by the owner.',
            ],
          },
          REQUIRE_STEP_UP: {
            meaning: 'Additional identity verification is required before proceeding.',
            what_to_do: 'The response includes details about what verification is needed. This typically involves a higher identity assurance level.',
          },
          REQUIRE_DEPOSIT: {
            meaning: 'A deposit must be placed before the action can proceed.',
            what_to_do: 'The response includes deposit requirements. Fulfill them before retrying.',
          },
        },
      },
      request_signing: {
        description: 'Every authenticated request (POST /v1/authorize, approval requests, etc.) must be signed with your Ed25519 private key. Use the SDK for automatic signing, or implement manually.',
        method: 'ed25519_signed_request',
        required_headers: {
          'X-Agent-Id': 'your agent_id',
          'X-Timestamp': 'ISO 8601 timestamp (must be within ±120 seconds of server time)',
          'X-Nonce': 'UUID v4 (single-use, expires after 600 seconds)',
          'X-Body-Sha256': 'hex-encoded SHA-256 of the request body (or of empty string for GET)',
          'X-Signature': 'base64-encoded Ed25519 signature of the signing input',
        },
        signing_input_format: 'METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nBODY_SHA256',
      },
      webhook: {
        description: 'OpenLeash sends real-time notifications to your webhook_url when your owner makes decisions. This is the fastest way to learn about approval results instead of polling.',
        authentication: 'Two layers: (1) HMAC-SHA256 signature in X-Webhook-Signature header using webhook_secret for payload integrity, (2) Bearer token in Authorization header using webhook_auth_token for endpoint authentication.',
        events: {
          'approval_request.approved': {
            description: 'Your owner approved an action. Contains the approval_token you need to retry authorization.',
            fields: ['approval_request_id', 'approval_token', 'approval_token_expires_at', 'action_type'],
          },
          'approval_request.denied': {
            description: 'Your owner denied an action. Do not proceed.',
            fields: ['approval_request_id', 'denial_reason', 'action_type'],
          },
          'policy_draft.approved': {
            description: 'A policy you proposed was approved by the owner.',
            fields: ['policy_draft_id', 'policy_id'],
          },
          'policy_draft.denied': {
            description: 'A policy you proposed was rejected by the owner.',
            fields: ['policy_draft_id', 'denial_reason'],
          },
        },
        payload_schema: {
          event_type: 'one of the event types above',
          timestamp: 'ISO 8601',
          agent_principal_id: 'your agent principal ID',
          data: { '...': 'event-specific fields listed above' },
        },
      },
      after_registration: {
        description: 'After registration, here is what you can and should do:',
        steps: [
          {
            step: 'Read the policy schema',
            method: 'GET',
            path: '/v1/agents/policy-schema',
            auth: 'none',
            description: 'Understand how policies work: the YAML format, supported actions, conditions, constraints, and obligations. This helps you understand why decisions are made and lets you propose well-formed policy drafts.',
          },
          {
            step: 'Suggest a policy draft',
            method: 'POST',
            path: '/v1/agent/policy-drafts',
            auth: 'agent (signed request)',
            description: 'Proactively propose policies based on what you observe. If your owner keeps manually approving the same kind of action, suggest a policy that covers it. This reduces friction for both of you. Your owner reviews and accepts or refuses every draft — you cannot activate a policy on your own.',
          },
          {
            step: 'Test policies in the playground',
            method: 'POST',
            path: '/v1/playground/run',
            auth: 'none',
            description: 'Test a policy YAML against a sample action to see what decision it produces. Use this before submitting a draft to make sure it behaves as intended.',
          },
        ],
      },
      api_reference: {
        interactive: `${baseUrl}/reference`,
        openapi_json: `${baseUrl}/reference/openapi.json`,
        openapi_yaml: `${baseUrl}/reference/openapi.yaml`,
      },
      sdks: {
        description: 'SDKs handle keypair generation, request signing, and the full registration flow. Using an SDK is the easiest way to get started.',
        typescript: {
          package: '@openleash/sdk-ts',
          install: 'npm install @openleash/sdk-ts',
          example: `import { redeemAgentInvite } from '@openleash/sdk-ts';\nconst agent = await redeemAgentInvite({ inviteUrl: '${baseUrl}/v1/agents/register-with-invite?invite_id=${query.invite_id}&invite_token=${query.invite_token}', agentId: 'my-agent', webhookUrl: 'https://my-agent.example.com/webhook', webhookSecret: 'your-hmac-secret', webhookAuthToken: 'your-bearer-token' });\n// agent.private_key_b64 — save this securely, you need it for signing\n// agent.endpoints — all available API endpoints\n// Use agent SDK functions like authorize(), createApprovalRequest(), etc.`,
        },
        python: {
          package: 'openleash-sdk',
          install: 'pip install openleash-sdk',
          example: `from openleash import redeem_agent_invite\nagent = await redeem_agent_invite(invite_url='${baseUrl}/v1/agents/register-with-invite?invite_id=${query.invite_id}&invite_token=${query.invite_token}', agent_id='my-agent', webhook_url='https://my-agent.example.com/webhook', webhook_secret='your-hmac-secret', webhook_auth_token='your-bearer-token')\n# agent['private_key_b64'] — save this securely\n# Use SDK functions for authorize(), create_approval_request(), etc.`,
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
      webhook_url: string;
      webhook_secret: string;
      webhook_auth_token: string;
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

    if (!body.webhook_url || !body.webhook_secret || !body.webhook_auth_token) {
      reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'webhook_url, webhook_secret, and webhook_auth_token are required' },
      });
      return;
    }

    // Validate webhook URL
    try {
      const parsed = new URL(body.webhook_url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('not http(s)');
      }
    } catch {
      reply.code(400).send({
        error: { code: 'INVALID_WEBHOOK_URL', message: 'webhook_url must be a valid HTTP or HTTPS URL' },
      });
      return;
    }

    // Enforce webhook URL uniqueness
    {
      const state = readState(dataDir);
      for (const entry of state.agents) {
        const existing = readAgentFile(dataDir, entry.agent_principal_id);
        if (existing.webhook_url === body.webhook_url) {
          reply.code(409).send({
            error: { code: 'WEBHOOK_URL_NOT_UNIQUE', message: 'An agent with this webhook_url already exists' },
          });
          return;
        }
      }
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
      webhook_url: body.webhook_url,
      webhook_secret: body.webhook_secret,
      webhook_auth_token: body.webhook_auth_token,
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
      webhook_url: body.webhook_url,
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
      webhook_url: body.webhook_url,
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
      api_reference: {
        interactive: `${baseUrl}/reference`,
        openapi_json: `${baseUrl}/reference/openapi.json`,
        openapi_yaml: `${baseUrl}/reference/openapi.yaml`,
      },
      sdks: {
        typescript: { package: '@openleash/sdk-ts', install: 'npm install @openleash/sdk-ts' },
        python: { package: 'openleash-sdk', install: 'pip install openleash-sdk' },
        go: { module: 'github.com/openleash/openleash/packages/sdk-go', install: 'go get github.com/openleash/openleash/packages/sdk-go' },
      },
    };
  });

  // GET /v1/agents/policy-schema — public policy YAML specification
  app.get('/v1/agents/policy-schema', async () => {
    return {
      description: 'OpenLeash Policy YAML Specification. Policies are YAML documents that define authorization rules for agent actions. The engine evaluates rules top-to-bottom; the first matching rule wins.',
      json_schema: policyJsonSchema,
      reference: {
        effects: {
          description: 'The effect applied when a rule matches.',
          values: ['allow', 'deny'],
        },
        action_matching: {
          description: 'The action field matches against the action_type in authorization requests. Supports exact match, wildcard (*), and hierarchical prefix matching (e.g. "communication.*" matches "communication.email.send").',
          examples: ['*', 'commerce.purchase', 'communication.email.*', 'finance.*'],
        },
        when_expressions: {
          description: 'Optional conditions evaluated against the full authorization request using JSONPath. Expressions compose with all (AND), any (OR), and not (negation).',
          operators: {
            eq: 'Equality check (any type)',
            neq: 'Inequality check (any type)',
            in: 'Value is in array',
            nin: 'Value is not in array',
            lt: 'Less than (numbers)',
            lte: 'Less than or equal (numbers)',
            gt: 'Greater than (numbers)',
            gte: 'Greater than or equal (numbers)',
            regex: 'JavaScript regex match (strings)',
            exists: 'Check if path exists (value field ignored)',
          },
          path_format: 'JSONPath starting with $. — e.g. $.payload.amount_minor, $.relying_party.domain, $.action_type',
          example: {
            all: [
              { match: { path: '$.payload.amount_minor', op: 'gt', value: 10000 } },
              { match: { path: '$.payload.currency', op: 'in', value: ['USD', 'EUR'] } },
            ],
          },
        },
        constraints: {
          description: 'Shorthand checks applied to common payload fields. These are convenience alternatives to when expressions.',
          fields: {
            amount_max: { type: 'number', description: 'Maximum payload.amount_minor' },
            amount_min: { type: 'number', description: 'Minimum payload.amount_minor' },
            currency: { type: 'string[]', description: 'Allowed values for payload.currency' },
            merchant_domain: { type: 'string[]', description: 'Allowed merchant domains (payload.merchant_domain or relying_party.domain)' },
            allowed_domains: { type: 'string[]', description: 'Whitelisted domains (payload.domain or relying_party.domain)' },
            blocked_domains: { type: 'string[]', description: 'Blacklisted domains (payload.domain or relying_party.domain)' },
          },
        },
        obligations: {
          description: 'Actions required before the decision takes effect. Obligations override the rule effect — e.g. an allow rule with a HUMAN_APPROVAL obligation produces REQUIRE_APPROVAL.',
          types: {
            HUMAN_APPROVAL: { decision: 'REQUIRE_APPROVAL', description: 'Owner must approve the action before it proceeds' },
            STEP_UP_AUTH: { decision: 'REQUIRE_STEP_UP', description: 'Additional authentication required' },
            DEPOSIT: { decision: 'REQUIRE_DEPOSIT', description: 'A deposit must be placed before proceeding' },
            COUNTERPARTY_ATTESTATION: { decision: 'ALLOW', description: 'Non-blocking attestation from the counterparty; decision stays ALLOW' },
          },
        },
        requirements: {
          description: 'Identity assurance requirements for the rule.',
          fields: {
            min_assurance_level: { values: ['LOW', 'SUBSTANTIAL', 'HIGH'], description: 'Minimum identity assurance level; triggers STEP_UP_AUTH if not met' },
            credential_scheme: { type: 'string', description: 'Required credential scheme identifier' },
          },
        },
        proof: {
          description: 'Cryptographic proof token settings for allow decisions.',
          fields: {
            required: { type: 'boolean', description: 'Whether a PASETO proof token is issued on ALLOW' },
            ttl_seconds: { type: 'number', description: 'Proof token time-to-live in seconds' },
          },
        },
      },
      action_taxonomy: ACTION_TAXONOMY,
      examples: [
        {
          name: 'Allow all email, deny everything else',
          policy_yaml: `version: 1\ndefault: deny\nrules:\n  - id: allow_email\n    effect: allow\n    action: "communication.email.*"`,
        },
        {
          name: 'Allow purchases under $500 USD, require approval above',
          policy_yaml: `version: 1\ndefault: deny\nrules:\n  - id: small_purchases\n    effect: allow\n    action: "commerce.purchase"\n    constraints:\n      amount_max: 50000\n      currency: ["USD"]\n  - id: large_purchases\n    effect: allow\n    action: "commerce.purchase"\n    obligations:\n      - type: HUMAN_APPROVAL`,
        },
        {
          name: 'Block specific domains, allow all web browsing',
          policy_yaml: `version: 1\ndefault: deny\nrules:\n  - id: safe_browsing\n    effect: allow\n    action: "web.browse"\n    constraints:\n      blocked_domains: ["malware.example.com", "phishing.example.com"]`,
        },
        {
          name: 'Conditional rule with when expression',
          policy_yaml: `version: 1\ndefault: deny\nrules:\n  - id: allow_trusted_transfers\n    effect: allow\n    action: "finance.transfer"\n    when:\n      all:\n        - match:\n            path: "$.payload.amount_minor"\n            op: lte\n            value: 100000\n        - match:\n            path: "$.relying_party.trust_profile"\n            op: in\n            value: ["HIGH", "REGULATED"]\n    proof:\n      required: true\n      ttl_seconds: 300`,
        },
      ],
      tips: {
        validation: 'Test your policy before submitting: POST /v1/playground/run with { "policy_yaml": "...", "action": { "action_type": "...", "payload": {...} } }',
        submit: 'Submit a policy draft: POST /v1/agent/policy-drafts (requires agent auth)',
        matching: 'Rules are evaluated top-to-bottom. The first matching rule wins. If no rule matches, the default effect applies.',
      },
    };
  });
}
