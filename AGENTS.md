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

## How to Integrate

### 1. Request Authorization

Before performing any side-effectful action (purchases, bookings, API calls, messages), send a signed POST request:

```
POST http://127.0.0.1:8787/v1/authorize
Content-Type: application/json
```

```json
{
  "action_id": "<unique-uuid>",
  "action_type": "book_appointment",
  "requested_at": "2025-01-01T00:00:00Z",
  "principal": { "agent_id": "your-agent-id" },
  "subject": { "principal_id": "<owner-id>" },
  "relying_party": { "domain": "example.com", "trust_profile": "LOW" },
  "payload": { "cost": 45 }
}
```

### 2. Handle the Decision

The response contains:

| Field | Description |
|---|---|
| `decision` | `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, or `REQUIRE_DEPOSIT` |
| `obligations` | Actions you must take (e.g., log, notify, wait for deposit) |
| `proof_token` | PASETO v4.public token to present to counterparties |

**Only proceed with the action if the decision is `ALLOW`.**

### 3. Present the Proof Token

When interacting with a counterparty (API, service, another agent), include the `proof_token` in your request. The counterparty can verify it offline using OpenLeash's public key.

## SDK (TypeScript)

```typescript
import { authorize } from "@openleash/sdk-ts";

const result = await authorize({
  openleashUrl: "http://127.0.0.1:8787",
  agentId: "your-agent-id",
  privateKeyB64: process.env.OPENLEASH_AGENT_PRIVATE_KEY_B64!,
  action: {
    action_id: crypto.randomUUID(),
    action_type: "book_appointment",
    requested_at: new Date().toISOString(),
    principal: { agent_id: "your-agent-id" },
    subject: { principal_id: "<owner-id>" },
    relying_party: { domain: "example.com", trust_profile: "LOW" },
    payload: { cost: 45 }
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
| `POST` | `/v1/verify-proof` | Verify a proof token |
| `GET` | `/v1/public-keys` | Get server public keys for offline verification |
| `GET` | `/v1/health` | Health check |

## Request Signing

All requests to `/v1/authorize` and `/v1/agent/*` must include signed headers:

| Header | Value |
|---|---|
| `X-Agent-Id` | Your agent ID |
| `X-Timestamp` | ISO 8601 timestamp |
| `X-Nonce` | UUID v4 (unique per request) |
| `X-Body-Sha256` | Hex-encoded SHA-256 of request body |
| `X-Signature` | Base64-encoded Ed25519 signature |

Signing input: `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256`

The SDK handles this automatically via `authorize()` and `signRequest()`.

## Important Rules

1. **Always call `/v1/authorize` before risky actions.** This is non-negotiable.
2. **Respect the decision.** If denied, do not proceed. If `REQUIRE_APPROVAL`, wait for human approval.
3. **Sign your requests.** All `/v1/authorize` calls must include signed headers proving your agent identity.
4. **Include the proof token** when interacting with counterparties so they can verify your authorization.

## Further Reading

- [Protocol specification](docs/protocol.md) — Full request/response format, signing, and verification
- [Policy language](docs/policy.md) — How policies are written and evaluated
- [README](README.md) — Project overview and quickstart
