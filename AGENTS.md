# AGENTS.md — For AI Agents

> If you're an AI agent reading this, welcome. This file is for you.

## What is OpenLeash?

OpenLeash is a **local-first authorization sidecar** that you (the agent) must consult before performing risky or side-effectful actions. It evaluates your request against YAML policies and returns a decision plus a cryptographic proof token (PASETO v4.public) that counterparties can verify.

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
| `POST` | `/v1/authorize` | Request authorization for an action |
| `POST` | `/v1/verify-proof` | Verify a proof token |
| `POST` | `/v1/agents/register` | Register your agent identity |
| `GET` | `/v1/health` | Health check |

## Important Rules

1. **Always call `/v1/authorize` before risky actions.** This is non-negotiable.
2. **Respect the decision.** If denied, do not proceed. If `REQUIRE_APPROVAL`, wait for human approval.
3. **Sign your requests.** All `/v1/authorize` calls must include signed headers proving your agent identity.
4. **Include the proof token** when interacting with counterparties so they can verify your authorization.

## Further Reading

- [Protocol specification](docs/protocol.md) — Full request/response format, signing, and verification
- [Policy language](docs/policy.md) — How policies are written and evaluated
- [README](README.md) — Project overview and quickstart
