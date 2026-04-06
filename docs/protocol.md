# openleash Protocol

## Agent Request Signing

All requests to `/v1/authorize` must include signed headers. This proves the request comes from the registered agent.

### Required Headers

| Header | Description |
|---|---|
| `X-Agent-Id` | The agent's ID string |
| `X-Timestamp` | RFC3339 UTC timestamp |
| `X-Nonce` | Unique nonce (UUID recommended) |
| `X-Body-Sha256` | SHA256 hex digest of the raw request body bytes |
| `X-Signature` | Base64-encoded Ed25519 signature |

### Signing Input

The signing input is constructed by concatenating these values with newlines:

```
METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256
```

Example:

```
POST
/v1/authorize
2024-01-15T10:30:00.000Z
a1b2c3d4-e5f6-7890-abcd-ef1234567890
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Verification Steps

The server verifies each request:

1. **Timestamp** — must be within ±`clock_skew_seconds` (default 120s) of server time
2. **Nonce** — must be unique per agent within `nonce_ttl_seconds` (default 600s)
3. **Body hash** — SHA256 of raw body bytes must match `X-Body-Sha256` header
4. **Agent lookup** — agent must exist in state and have status `ACTIVE`
5. **Signature** — Ed25519 verification using agent's registered public key

## Canonical Hashing (RFC 8785)

Action hashes use JSON Canonicalization Scheme (JCS) per RFC 8785:

```
action_hash = SHA256_HEX(JCS(ActionRequest))
```

JCS ensures deterministic JSON serialization:
- Object keys sorted lexicographically
- Numbers formatted per IEEE 754 (handles floats correctly)
- No unnecessary whitespace

The `json-canonicalize` library implements this.

## Proof Tokens (PASETO v4.public)

Proof tokens are PASETO v4.public tokens signed with Ed25519. They provide cryptographic proof that an action was authorized.

### Token Claims

| Claim | Description |
|---|---|
| `iss` | Always `"openleash"` |
| `kid` | Signing key ID |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp |
| `decision_id` | UUID of the authorization decision |
| `owner_type` | Owner type (`"user"` or `"org"`) |
| `owner_id` | UUID of the owner |
| `agent_id` | Agent ID string |
| `action_type` | Type of action authorized |
| `action_hash` | SHA256 hash of canonical action |
| `matched_rule_id` | ID of the matching policy rule (nullable) |
| `trust_profile` | Trust profile from relying party (optional) |
| `constraints_snapshot` | Constraints at time of evaluation (optional) |

### Issuance Rules

A proof token is issued only when:
1. The final decision is `ALLOW`
2. AND either:
   - `rule.proof.required` is `true`
   - OR `relying_party.trust_profile` is `HIGH` or `REGULATED`

### TTL

- Uses `rule.proof.ttl_seconds` if set
- Falls back to `config.tokens.default_ttl_seconds` (default 120s)
- Cannot exceed `config.tokens.max_ttl_seconds` (default 3600s)

## Verification

### Online Verification

`POST /v1/verify-proof` verifies a token against the server's keys:

```json
{
  "token": "v4.public.xxx",
  "expected_action_hash": "abc123...",
  "expected_agent_id": "my-agent"
}
```

Response:

```json
{
  "valid": true,
  "claims": { ... }
}
```

### Offline Verification

Using the SDK:

```typescript
import { verifyProofOffline } from '@openleash/sdk-ts';

const result = await verifyProofOffline({
  token: 'v4.public.xxx',
  publicKeys: [{ kid: 'key-id', public_key_b64: '...' }],
});
```

Fetch public keys from `GET /v1/public-keys`.

## Agent Registration

There are two ways to register an agent: **invite-based** (recommended) and **challenge-response** (programmatic).

### Invite-Based Registration (Recommended)

Owners create agent invite URLs from the GUI or API. The invite URL is self-contained and single-use.

**Creating an invite (owner-authed):**

```
POST /v1/owner/agent-invites
Authorization: Bearer <session_token>
```

Returns `invite_id`, `invite_token`, and `expires_at` (24 hours).

**Creating an invite (admin-authed):**

```
POST /v1/admin/owners/:ownerId/agent-invite
```

**Redeeming an invite:**

The agent `GET`s the invite URL to receive registration instructions, then `POST`s with its public key:

```
POST /v1/agents/register-with-invite
{
  "invite_id": "<from URL or body>",
  "invite_token": "<from URL or body>",
  "agent_id": "my-agent",
  "agent_pubkey_b64": "<SPKI DER base64>"
}
```

The `invite_id` and `invite_token` can also be passed as query parameters.

The server verifies the hashed invite token, creates the agent, marks the invite as used, and returns:

- Agent identity (`agent_principal_id`, `agent_id`, `owner_type`, `owner_id`)
- Server URL (`openleash_url`)
- Auth protocol details (`auth`) — signing method, required headers, signing input format
- Available endpoints (`endpoints`) — method, path, and description for each
- SDK install commands (`sdks`) — for TypeScript, Python, and Go

**Using the TypeScript SDK:**

```typescript
import { redeemAgentInvite } from '@openleash/sdk-ts';

const agent = await redeemAgentInvite({
  inviteUrl: 'http://127.0.0.1:8787/v1/agents/register-with-invite?invite_id=...&invite_token=...',
  agentId: 'my-agent',
});
// agent.private_key_b64 — generated locally, never sent to the server
// agent.openleash_url   — server URL
// agent.auth            — signing protocol details
// agent.endpoints       — available API endpoints
```

### Challenge-Response Registration

For programmatic registration without an invite (e.g., from admin tooling):

#### Step 1: Request Challenge

```
POST /v1/agents/registration-challenge
{
  "agent_id": "my-agent",
  "agent_pubkey_b64": "<SPKI DER base64>",
  "owner_type": "user",
  "owner_id": "<uuid>"
}
```

Returns a random challenge with 5-minute expiry.

#### Step 2: Register with Signed Challenge

```
POST /v1/agents/register
{
  "challenge_id": "<uuid>",
  "agent_id": "my-agent",
  "agent_pubkey_b64": "<SPKI DER base64>",
  "signature_b64": "<Ed25519 signature over challenge bytes>",
  "owner_type": "user",
  "owner_id": "<uuid>"
}
```

The server verifies the signature over the raw challenge bytes, creates the agent, and returns the agent principal ID.

## Owner Session Tokens (PASETO v4.public)

Owner sessions use PASETO v4.public tokens signed with the same Ed25519 key used for proof tokens. Session tokens are distinguished by the `purpose: 'owner_session'` claim.

### Session Token Claims

| Claim | Description |
|---|---|
| `iss` | Always `"openleash"` |
| `kid` | Signing key ID |
| `sub` | Owner `user_principal_id` |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp |
| `purpose` | Always `"owner_session"` |

### Issuance

- Issued on successful `POST /v1/owner/login`
- Default TTL: 8 hours (configurable via `sessions.ttl_seconds`)
- Sessions are stateless — no server-side session store
- Revocation is only via token expiry

### Authentication Flow

1. Admin creates an owner (`POST /v1/admin/owners`) and generates a setup invite (`POST /v1/admin/owners/:ownerId/setup-invite`)
2. Owner completes setup (`POST /v1/owner/setup`) with the invite token and a passphrase
3. Owner logs in (`POST /v1/owner/login`) with principal ID and passphrase
4. Server returns a PASETO session token
5. Owner includes token in `Authorization: Bearer <token>` header for all owner-scoped API calls

## Approval Tokens (PASETO v4.public)

When an owner approves a `HUMAN_APPROVAL` request, the server issues an approval token. This is a single-use, action-scoped PASETO token that the agent includes in its re-authorization request.

### Approval Token Claims

| Claim | Description |
|---|---|
| `iss` | Always `"openleash"` |
| `kid` | Signing key ID |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp |
| `approval_request_id` | UUID of the approval request |
| `owner_type` | Owner type (`"user"` or `"org"`) |
| `owner_id` | UUID of the approving owner |
| `agent_id` | Agent ID string |
| `action_type` | Type of action approved |
| `action_hash` | SHA256 hash of the canonical action |
| `purpose` | Always `"approval"` |

### Approval Flow

1. Agent calls `POST /v1/authorize` — receives `REQUIRE_APPROVAL` with `HUMAN_APPROVAL` obligation
2. Agent creates approval request (`POST /v1/agent/approval-requests`) with the action and justification
3. Owner reviews and approves (`POST /v1/owner/approval-requests/:id/approve`) — receives approval token
4. Agent polls (`GET /v1/agent/approval-requests/:id`) — receives approval token when approved
5. Agent re-authorizes (`POST /v1/authorize`) with the original action + `approval_token` in request body
6. Server verifies approval token, checks action hash match, marks token as consumed, issues proof token

### Single-Use Enforcement

Each approval token can only be used once. After the agent re-authorizes successfully, the approval request is marked with a `consumed_at` timestamp. Subsequent attempts to use the same token return `APPROVAL_TOKEN_CONSUMED`.

### TTL

- Default: 1 hour (configurable via `approval.token_ttl_seconds`)
- Approval requests themselves expire after 24 hours by default (`approval.request_ttl_seconds`)

## Policy Drafts

Agents can propose new policies for owner review. This allows agents to request access to action types not covered by their current policy, without requiring the owner to anticipate every need in advance.

### Draft Lifecycle

1. Agent submits a draft policy (`POST /v1/agent/policy-drafts`) with valid YAML, an optional target agent, and a justification
2. Server validates the YAML against the policy schema and stores the draft with status `PENDING`
3. Owner reviews pending drafts (`GET /v1/owner/policy-drafts?status=PENDING`)
4. Owner approves (`POST /v1/owner/policy-drafts/:id/approve`) or denies (`POST /v1/owner/policy-drafts/:id/deny`)
5. On approval: server creates a real policy file, adds it to state with a binding, and records the `resulting_policy_id` on the draft
6. On denial: server records the owner's reason on the draft
7. Agent polls (`GET /v1/agent/policy-drafts/:id`) to see the outcome

### Agent Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/agent/policy-drafts` | Agent-signed | Submit a draft policy |
| `GET` | `/v1/agent/policy-drafts` | Agent-signed | List own drafts (optional `?status=` filter) |
| `GET` | `/v1/agent/policy-drafts/:id` | Agent-signed | Get draft status and details |

#### POST /v1/agent/policy-drafts

Request body:

| Field | Required | Description |
|---|---|---|
| `policy_yaml` | Yes | Valid policy YAML (validated against schema on submission) |
| `applies_to_agent_principal_id` | No | UUID of the agent this policy should apply to (null = owner-wide) |
| `justification` | No | Human-readable explanation of why the policy is needed |

Response:

```json
{
  "policy_draft_id": "<uuid>",
  "status": "PENDING",
  "created_at": "2025-01-15T10:30:00.000Z"
}
```

#### GET /v1/agent/policy-drafts/:id

Returns draft details including `status`, `policy_yaml`, `justification`, `resulting_policy_id` (if approved), and `denial_reason` (if denied).

### Owner Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/owner/policy-drafts` | Session token | List drafts from agents (optional `?status=` filter) |
| `GET` | `/v1/owner/policy-drafts/:id` | Session token | View draft details with full YAML |
| `POST` | `/v1/owner/policy-drafts/:id/approve` | Session token | Approve draft — creates real policy + binding |
| `POST` | `/v1/owner/policy-drafts/:id/deny` | Session token | Deny draft with optional reason |

#### POST /v1/owner/policy-drafts/:id/approve

- Requires TOTP code if the owner has two-factor authentication enabled
- Re-validates the policy YAML before creating the policy (defensive)
- Creates the policy file, adds it to state with a binding, and updates the draft status to `APPROVED`
- Returns `policy_draft_id`, `status`, `policy_id` (the created policy), and `applies_to_agent_principal_id`

#### POST /v1/owner/policy-drafts/:id/deny

Request body:

| Field | Required | Description |
|---|---|---|
| `reason` | No | Human-readable explanation for the denial |
| `totp_code` | No | TOTP code if two-factor authentication is enabled |

### Storage

Draft files are stored at `./data/policy-drafts/{policy_draft_id}.md` using markdown with YAML frontmatter. Drafts are tracked in `state.md` under the `policy_drafts` array.

### Audit Events

| Event | When |
|---|---|
| `POLICY_DRAFT_CREATED` | Agent submits a draft |
| `POLICY_DRAFT_APPROVED` | Owner approves a draft (includes `policy_id` of created policy) |
| `POLICY_DRAFT_DENIED` | Owner denies a draft |

## Default Behavior When No Policy Is Bound

If an agent calls `POST /v1/authorize` but no policy is bound to the agent or its owner, the server returns HTTP `403` with error code `NO_POLICY`. The authorization engine is never invoked — the server rejects the request before evaluation.

To fix this, the owner must create a policy and bind it to the agent (or to all agents for that owner) via the owner portal or the `policy upsert` CLI command. Alternatively, agents can propose a policy via the [Policy Drafts](#policy-drafts) flow — the owner reviews and approves the draft, which automatically creates and binds the policy.

## Error Codes

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Agent Authentication (401)

| Code | Cause |
|---|---|
| `MISSING_HEADERS` | One or more required signing headers (`X-Agent-Id`, `X-Timestamp`, `X-Nonce`, `X-Body-Sha256`, `X-Signature`) are missing |
| `TIMESTAMP_SKEW` | Request timestamp falls outside the allowed clock skew window (default ±120s) |
| `NONCE_REPLAY` | Nonce has already been used for this agent within the TTL window (default 600s) |
| `BODY_HASH_MISMATCH` | SHA-256 of the request body does not match the `X-Body-Sha256` header |
| `MISSING_BODY` | Request requires a body but none was provided |
| `AGENT_NOT_FOUND` | No agent registered with the given `X-Agent-Id` |
| `AGENT_INACTIVE` | Agent exists but has been revoked (status is not ACTIVE) |
| `INVALID_SIGNATURE` | Ed25519 signature verification failed |

### Owner Authentication (401)

| Code | Cause |
|---|---|
| `MISSING_TOKEN` | No session token in Authorization header or `openleash_session` cookie |
| `INVALID_SESSION` | Session token is invalid, expired, or signature verification failed |
| `OWNER_NOT_FOUND` | Owner from session token is not found in state |
| `OWNER_INACTIVE` | Owner exists but has inactive status |

### Admin Authentication

| Code | HTTP | Cause |
|---|---|---|
| `ADMIN_FORBIDDEN` | 403 | Remote access without `allow_remote_admin: true` |
| `ADMIN_UNAUTHORIZED` | 401 | Invalid or missing admin bearer token |

### Authorization

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_ACTION_REQUEST` | 400 | Action request body fails schema validation |
| `NO_POLICY` | 403 | No policy is bound to the requesting agent or its owner |
| `POLICY_NOT_FOUND` | 500 | Policy is listed in state but the file is missing on disk |

### Approval Tokens

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_APPROVAL_TOKEN` | 401 | Approval token is invalid, expired, or signature verification failed |
| `APPROVAL_REQUEST_NOT_FOUND` | 400 | Referenced approval request does not exist |
| `INVALID_APPROVAL_STATUS` | 400 | Approval request is not in APPROVED status |
| `APPROVAL_TOKEN_CONSUMED` | 400 | Approval token has already been used (single-use) |
| `ACTION_HASH_MISMATCH` | 400 | Action hash does not match the approved action |
| `AGENT_MISMATCH` | 400 | Agent ID does not match the approved agent |

### Registration

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_KEY` | 400 | Public key is not valid base64 SPKI/DER Ed25519 |
| `INVITE_NOT_FOUND` | 404 | Agent invite does not exist |
| `INVITE_USED` | 400 | Invite has already been redeemed |
| `INVITE_EXPIRED` | 400 | Invite has passed its expiration time |
| `INVALID_INVITE_TOKEN` | 401 | Invite token hash does not match |
| `CHALLENGE_NOT_FOUND` | 400 | Registration challenge does not exist or has expired |
| `CHALLENGE_EXPIRED` | 400 | Registration challenge has passed its expiration time |

### Owner Setup and Login

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_REQUEST` | 400 | Required fields are missing from request body |
| `WEAK_PASSPHRASE` | 400 | Passphrase is shorter than 8 characters |
| `SETUP_ALREADY_COMPLETED` | 403 | Initial setup has already been completed |
| `INVITE_NOT_FOUND` | 404 | Setup invite does not exist |
| `INVITE_USED` | 400 | Setup invite has already been redeemed |
| `INVITE_EXPIRED` | 400 | Setup invite has expired |
| `INVALID_INVITE_TOKEN` | 401 | Setup invite token does not match |
| `INVALID_CREDENTIALS` | 401 | Owner not found, inactive, or passphrase verification failed |
| `SETUP_REQUIRED` | 401 | Owner has not completed setup (no passphrase set) |

### TOTP (Two-Factor Authentication)

| Code | HTTP | Cause |
|---|---|---|
| `TOTP_SETUP_REQUIRED` | 403 | Server requires TOTP but owner hasn't set it up |
| `TOTP_REQUIRED` | 403 | Owner has TOTP enabled but code was not provided or is invalid |
| `TOTP_NOT_SETUP` | 400 | Attempt to confirm TOTP when no secret has been generated |
| `INVALID_TOTP_CODE` | 400 | TOTP code does not match |
| `TOTP_NOT_ENABLED` | 400 | Attempt to disable TOTP when it is not enabled |

### Policy Drafts

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_REQUEST` | 400 | `policy_yaml` field is missing from request body |
| `INVALID_POLICY` | 400 | Policy YAML fails schema validation |
| `NOT_FOUND` | 404 | Policy draft not found or does not belong to the requesting agent/owner |
| `FILE_NOT_FOUND` | 404 | Policy draft file listed in state does not exist on disk |
| `INVALID_STATUS` | 400 | Draft is not in PENDING status (already approved or denied) |

### Owner Operations

| Code | HTTP | Cause |
|---|---|---|
| `NOT_FOUND` | 404 | Agent, policy, approval request, or policy draft not found |
| `FILE_NOT_FOUND` | 404 | File listed in state does not exist on disk |
| `INVALID_POLICY` | 400 | Policy YAML fails schema validation |
| `INVALID_IDENTITY` | 400 | Owner identity validation failed |
| `INVALID_STATUS` | 400 | Approval request or policy draft is not in PENDING status |
| `REQUEST_EXPIRED` | 400 | Approval request has expired |
