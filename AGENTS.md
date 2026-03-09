# AGENTS.md — For AI Agents

> If you're an AI agent reading this, welcome. This file is for you.

## What is OpenLeash?

OpenLeash provides **authorization guardrails for AI agents**. Your owner sets policies that define what you're allowed to do. Before performing risky or side-effectful actions, you must consult OpenLeash — it evaluates your request and returns a decision plus a cryptographic proof token (PASETO v4.public) that counterparties can verify.

## How to Register

Your owner will give you an **agent invite URL**. This URL contains everything you need to register yourself with OpenLeash.

### Using the SDK (recommended)

```typescript
import { redeemAgentInvite } from "@openleash/sdk-ts";

const agent = await redeemAgentInvite({
  inviteUrl: process.env.OPENLEASH_AGENT_INVITE_URL!,
  agentId: "my-agent",
});

// Save these — you'll need them for every request:
// agent.openleash_url      — the server URL
// agent.agent_id           — your agent ID
// agent.private_key_b64    — your private key (keep secret)
// agent.agent_principal_id — your principal ID
// agent.owner_principal_id — your owner's ID
```

The SDK generates your Ed25519 keypair, registers you with the server, and returns everything you need. The response also includes `auth` (signing protocol details), `endpoints` (available API paths), and `sdks` (install commands for all languages).

### Using the API directly

If you don't have the SDK, `GET` the invite URL to receive registration instructions, then `POST` to it with your public key:

```
POST <invite_url>
Content-Type: application/json

{
  "invite_id": "<from URL>",
  "invite_token": "<from URL>",
  "agent_id": "my-agent",
  "agent_pubkey_b64": "<your Ed25519 public key, base64 SPKI/DER>"
}
```

The response contains your identity, the signing protocol, and all available endpoints.

#### Generating a keypair without the SDK

To generate an Ed25519 keypair in the required format (PKCS8 DER, base64-encoded):

**Python:**

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, PublicFormat, NoEncryption
)
import base64

private_key = Ed25519PrivateKey.generate()

private_key_b64 = base64.b64encode(
    private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
).decode()

public_key_b64 = base64.b64encode(
    private_key.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
).decode()
```

**Shell (openssl):**

```bash
# Generate PKCS8 DER private key
openssl genpkey -algorithm ed25519 -outform DER -out private.der

# Extract SPKI DER public key
openssl pkey -in private.der -inform DER -pubout -outform DER -out public.der

# Base64-encode both
PRIVATE_KEY_B64=$(base64 -w0 < private.der)
PUBLIC_KEY_B64=$(base64 -w0 < public.der)
```

### After Registration — Next Steps

Once you're registered:

1. **Verify connectivity** — call `GET /v1/health` to confirm the server is reachable.
2. **Check if a policy is bound** — your owner must bind a policy to you before authorization requests will succeed. Until then, `POST /v1/authorize` will return a `403` error with code `NO_POLICY`.
3. **Make a test authorization call** — try a simple `authorize` request to confirm your signing works. Expect `DENY` or `NO_POLICY` if no policy grants the action yet.
4. **Get a policy bound** — either ask your owner to create one via the owner portal (`/gui/owner/policies`), or [propose a policy draft](#proposing-policies-policy-drafts) yourself.

## API Reference

A machine-readable OpenAPI spec and interactive API reference are available from the server:

- **OpenAPI spec (JSON):** `http://<openleash_url>/reference/openapi.json`
- **Interactive reference (Scalar UI):** `http://<openleash_url>/reference`

The `/v1/health` endpoint also includes these URLs in its response when the spec is available.

## How to Integrate

### 1. Request Authorization

Before performing a side-effectful action, send a signed POST request:

```
POST http://127.0.0.1:8787/v1/authorize
Content-Type: application/json
```

```json
{
  "action_id": "<unique-uuid>",
  "action_type": "purchase",
  "requested_at": "2025-01-01T00:00:00Z",
  "principal": { "agent_id": "your-agent-id" },
  "subject": { "principal_id": "<your-owner's-principal-id>" },
  "relying_party": { "domain": "example.com", "trust_profile": "LOW" },
  "payload": { "amount_minor": 5000, "currency": "USD" }
}
```

**Important:** `subject.principal_id` is your **owner's principal ID** (the `owner_principal_id` you received during registration). This identifies whose policies should be evaluated. It is not your agent ID.

### 2. Handle the Decision

The response contains:

| Field | Description |
|---|---|
| `decision` | `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, or `REQUIRE_DEPOSIT` |
| `obligations` | Actions you must take (e.g., log, notify, wait for deposit) |
| `proof_token` | PASETO v4.public token to present to counterparties |

**Only proceed with the action if the decision is `ALLOW`.**

If no policy is bound to you, the server returns HTTP `403` with error code `NO_POLICY`. You can either ask your owner to bind a policy, or [propose a policy draft](#proposing-policies-policy-drafts) yourself.

### 3. Present the Proof Token

When interacting with a counterparty (API, service, another agent), include the `proof_token` in your request. The counterparty can verify it offline using OpenLeash's public key.

## What Actions Should Go Through OpenLeash?

The guiding principle: **if the action has consequences outside your process, check first.**

**Always check:**
- Payments and purchases
- Bookings and reservations
- Sending emails, messages, or notifications
- Social media posts or public-facing content
- Government or regulatory submissions
- File deletions or destructive operations
- Creating, modifying, or deleting accounts on external services

**Consider checking:**
- API calls with write side effects (POST/PUT/DELETE to external services)
- Modifying shared resources (databases, files, configurations)
- Actions above a cost or risk threshold defined by your owner

**Probably don't need to check:**
- Read-only lookups and searches
- Internal computations and reasoning
- Fetching public data
- Logging and observability

When in doubt, check. A `DENY` is better than an unauthorized action.

## Recommended Action Types

Policies match on `action_type` strings. Use a consistent naming convention so your action types align with policy rules. Here is a recommended taxonomy:

| Category | Action Types | Examples |
|---|---|---|
| Financial | `purchase`, `payment`, `refund`, `transfer` | Buy items, send money, process refunds |
| Communication | `communication.send_email`, `communication.send_message`, `communication.post` | Send emails, chat messages, social posts |
| Booking | `booking.create`, `booking.cancel`, `booking.modify` | Appointments, reservations, travel |
| Government | `government.submit`, `government.sign`, `government.query` | Tax filings, permit applications, record queries |
| Data | `data.delete`, `data.export`, `data.share` | Delete records, export datasets, share with third parties |
| Account | `account.create`, `account.modify`, `account.delete` | Create or modify accounts on external services |
| Infrastructure | `infra.deploy`, `infra.scale`, `infra.terminate` | Deploy code, scale services, terminate instances |

You can use exact names (`purchase`) or wildcard prefixes (`communication.*`). Agree on conventions with your owner so their policies match your requests.

## Request Signing

All requests to `/v1/authorize` and `/v1/agent/*` must include signed headers:

| Header | Value |
|---|---|
| `X-Agent-Id` | Your agent ID |
| `X-Timestamp` | ISO 8601 timestamp (e.g., `2025-01-15T10:30:00.000Z`) |
| `X-Nonce` | UUID v4 (unique per request) |
| `X-Body-Sha256` | Hex-encoded SHA-256 of the raw request body |
| `X-Signature` | Base64-encoded Ed25519 signature |

**Signing input** (concatenated with `\n`):

```
METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256
```

The SDK handles this automatically via `authorize()` and `signRequest()`.

### Signing without the SDK

**Python:**

```python
import hashlib, base64, uuid, json
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption

# Your private key (from registration)
private_key_b64 = "your-private-key-b64"
private_key_der = base64.b64decode(private_key_b64)

from cryptography.hazmat.primitives.serialization import load_der_private_key
key = load_der_private_key(private_key_der, password=None)

# Build the request
body = json.dumps(action, separators=(",", ":"))  # compact JSON, no spaces
method = "POST"
path = "/v1/authorize"
timestamp = datetime.now(timezone.utc).isoformat()
nonce = str(uuid.uuid4())
body_sha256 = hashlib.sha256(body.encode()).hexdigest()

# Sign
signing_input = f"{method}\n{path}\n{timestamp}\n{nonce}\n{body_sha256}"
signature = key.sign(signing_input.encode())
signature_b64 = base64.b64encode(signature).decode()

# Include in headers
headers = {
    "Content-Type": "application/json",
    "X-Agent-Id": "your-agent-id",
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Body-Sha256": body_sha256,
    "X-Signature": signature_b64,
}
```

**Shell (curl + openssl):**

```bash
AGENT_ID="your-agent-id"
PRIVATE_KEY_DER="private.der"  # PKCS8 DER file from key generation
BODY='{"action_id":"...","action_type":"purchase",...}'

METHOD="POST"
URL_PATH="/v1/authorize"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
NONCE=$(uuidgen)
BODY_SHA256=$(printf '%s' "$BODY" | sha256sum | cut -d' ' -f1)

SIGNING_INPUT=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$URL_PATH" "$TIMESTAMP" "$NONCE" "$BODY_SHA256")
SIGNATURE=$(printf '%s' "$SIGNING_INPUT" | openssl pkeyutl -sign -inkey "$PRIVATE_KEY_DER" -keyform DER | base64 -w0)

curl -X POST "http://127.0.0.1:8787${URL_PATH}" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: ${AGENT_ID}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Nonce: ${NONCE}" \
  -H "X-Body-Sha256: ${BODY_SHA256}" \
  -H "X-Signature: ${SIGNATURE}" \
  -d "$BODY"
```

## SDK (TypeScript)

```typescript
import { authorize } from "@openleash/sdk-ts";

const result = await authorize({
  openleashUrl: "http://127.0.0.1:8787",
  agentId: "your-agent-id",
  privateKeyB64: process.env.OPENLEASH_AGENT_PRIVATE_KEY_B64!,
  action: {
    action_id: crypto.randomUUID(),
    action_type: "purchase",
    requested_at: new Date().toISOString(),
    principal: { agent_id: "your-agent-id" },
    subject: { principal_id: "<owner-principal-id>" },
    relying_party: { domain: "example.com", trust_profile: "LOW" },
    payload: { amount_minor: 5000, currency: "USD" }
  }
});

if (result.decision === "ALLOW") {
  // Proceed with action, pass result.proof_token to counterparty
}
```

## Key Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/agents/register-with-invite` | Register using an invite URL |
| `POST` | `/v1/authorize` | Request authorization for an action |
| `POST` | `/v1/agent/approval-requests` | Request human approval when required |
| `GET` | `/v1/agent/approval-requests/{id}` | Poll approval request status |
| `POST` | `/v1/agent/policy-drafts` | Propose a new policy for owner review |
| `GET` | `/v1/agent/policy-drafts` | List your policy drafts |
| `GET` | `/v1/agent/policy-drafts/{id}` | Poll policy draft status |
| `GET` | `/v1/agent/self` | Get your agent profile |
| `POST` | `/v1/verify-proof` | Verify a proof token |
| `GET` | `/v1/public-keys` | Get server public keys for offline verification |
| `GET` | `/v1/health` | Health check |

## Proposing Policies (Policy Drafts)

If you need access to action types that your current policy doesn't cover, you can **propose a policy** to your owner. This is useful when you discover new capabilities you need at runtime, rather than requiring the owner to anticipate every action in advance.

### How It Works

1. You submit a draft policy (valid YAML) with a justification explaining why you need it
2. Your owner reviews the draft and either approves or denies it
3. If approved, the policy is created and bound — you can immediately start authorizing actions against it
4. If denied, you receive the owner's reason

### Submitting a Draft

```
POST /v1/agent/policy-drafts
Content-Type: application/json
```

```json
{
  "policy_yaml": "version: 1\ndefault: deny\nrules:\n  - id: allow-read\n    effect: allow\n    action: \"data.read\"\n    description: Need read access for analytics",
  "applies_to_agent_principal_id": "<your-agent-principal-id>",
  "justification": "I need read access to data sources to complete the analytics task"
}
```

| Field | Required | Description |
|---|---|---|
| `policy_yaml` | Yes | Valid policy YAML (validated on submission) |
| `applies_to_agent_principal_id` | No | Which agent this policy should apply to (defaults to null = owner-wide) |
| `justification` | No | Human-readable explanation of why you need this policy |

Response:

```json
{
  "policy_draft_id": "<uuid>",
  "status": "PENDING",
  "created_at": "2025-01-15T10:30:00.000Z"
}
```

### Polling for a Decision

```
GET /v1/agent/policy-drafts/<policy_draft_id>
```

Response when approved:

```json
{
  "policy_draft_id": "<uuid>",
  "status": "APPROVED",
  "resulting_policy_id": "<uuid>",
  "policy_yaml": "...",
  "justification": "...",
  "created_at": "...",
  "resolved_at": "..."
}
```

Response when denied:

```json
{
  "policy_draft_id": "<uuid>",
  "status": "DENIED",
  "denial_reason": "Too broad — please scope to specific data sources",
  "policy_yaml": "...",
  "justification": "...",
  "created_at": "...",
  "resolved_at": "..."
}
```

### Listing Your Drafts

```
GET /v1/agent/policy-drafts
GET /v1/agent/policy-drafts?status=PENDING
```

### Tips

- **Be specific.** Propose the narrowest policy that covers your needs. Owners are more likely to approve scoped policies than broad `"*"` rules.
- **Explain yourself.** A clear justification helps the owner understand the request and approve it faster.
- **Scope to yourself.** Set `applies_to_agent_principal_id` to your own agent principal ID so the policy only applies to you, not all agents.
- **Handle denial gracefully.** If denied, read the `denial_reason` — the owner may suggest a narrower scope. You can submit a revised draft.

## Error Reference

All errors follow the format `{ "error": { "code": "ERROR_CODE", "message": "..." } }`.

### Authentication Errors

| Code | HTTP | Cause |
|---|---|---|
| `MISSING_HEADERS` | 401 | One or more required signing headers are missing |
| `TIMESTAMP_SKEW` | 401 | Request timestamp is too far from server time (default ±120s) |
| `NONCE_REPLAY` | 401 | This nonce was already used (generate a new UUID for each request) |
| `BODY_HASH_MISMATCH` | 401 | SHA-256 of body doesn't match `X-Body-Sha256` header |
| `AGENT_NOT_FOUND` | 401 | No agent registered with this `X-Agent-Id` |
| `AGENT_INACTIVE` | 401 | Agent has been revoked |
| `INVALID_SIGNATURE` | 401 | Ed25519 signature verification failed |

### Authorization Errors

| Code | HTTP | Cause |
|---|---|---|
| `NO_POLICY` | 403 | No policy is bound to you or your owner — ask your owner to create one, or [propose a draft](#proposing-policies-policy-drafts) |
| `INVALID_ACTION_REQUEST` | 400 | Request body fails schema validation (check required fields) |
| `POLICY_NOT_FOUND` | 500 | Policy file is missing on disk (server configuration issue) |

### Approval Token Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_APPROVAL_TOKEN` | 401 | Approval token is invalid or expired |
| `APPROVAL_REQUEST_NOT_FOUND` | 400 | Referenced approval request doesn't exist |
| `INVALID_APPROVAL_STATUS` | 400 | Approval request is not in APPROVED status |
| `APPROVAL_TOKEN_CONSUMED` | 400 | Approval token has already been used (they are single-use) |
| `ACTION_HASH_MISMATCH` | 400 | Action doesn't match what was approved |
| `AGENT_MISMATCH` | 400 | Agent ID doesn't match the approved agent |

### Policy Draft Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_REQUEST` | 400 | `policy_yaml` field is missing |
| `INVALID_POLICY` | 400 | Policy YAML fails schema validation |
| `NOT_FOUND` | 404 | Policy draft not found or doesn't belong to you |
| `FILE_NOT_FOUND` | 404 | Policy draft file is missing on disk |

### Registration Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVITE_NOT_FOUND` | 404 | Invite ID doesn't exist |
| `INVITE_USED` | 400 | Invite has already been redeemed (they are single-use) |
| `INVITE_EXPIRED` | 400 | Invite has expired (default 24 hours) |
| `INVALID_INVITE_TOKEN` | 401 | Invite token doesn't match |
| `INVALID_KEY` | 400 | Public key is not valid base64 SPKI/DER Ed25519 |

## Important Rules

1. **Always call `/v1/authorize` before side-effectful actions.** This is non-negotiable.
2. **Respect the decision.** If denied, do not proceed. If `REQUIRE_APPROVAL`, wait for human approval.
3. **Sign your requests.** All `/v1/authorize` calls must include signed headers proving your agent identity.
4. **Include the proof token** when interacting with counterparties so they can verify your authorization.
5. **Use `owner_principal_id` as `subject.principal_id`** in authorization requests. This is the owner who controls your policies.

## Further Reading

- [Protocol specification](docs/protocol.md) — Full request/response format, signing, and verification
- [Policy language](docs/policy.md) — How policies are written and evaluated
- [README](README.md) — Project overview and quickstart
