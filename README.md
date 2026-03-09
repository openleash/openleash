<div align="center">

<img src="https://openleash.ai/brand/openleash-mark.svg" alt="OpenLeash logo" width="80" />

# OpenLeash

🔐 **Local-first authorization and proof sidecar for AI agents.** 🦞

[![CI](https://img.shields.io/github/actions/workflow/status/openleash/openleash/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/openleash/openleash/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@openleash/core?style=for-the-badge&label=npm)](https://www.npmjs.com/package/@openleash/core)
[![License](https://img.shields.io/github/license/openleash/openleash?style=for-the-badge)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/openleash/openleash?style=for-the-badge)](https://github.com/openleash/openleash/discussions)

[📖 Docs](docs/) &bull; [🚀 Getting Started](#quickstart) &bull; [📦 npm](https://www.npmjs.com/org/openleash) &bull; [💬 Discussions](https://github.com/openleash/openleash/discussions)

</div>

---

## What is OpenLeash?

OpenLeash runs locally next to your AI agent runtime. Before an agent takes a side-effectful action (purchases, bookings, sending messages, government submissions), it asks OpenLeash:

1. **Is this agent allowed to do this action right now?**
2. **If allowed, can the agent get a cryptographic proof that others can verify?**

OpenLeash evaluates the request against a YAML policy and returns a decision (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, `REQUIRE_DEPOSIT`), a list of obligations, and optionally a short-lived proof token (PASETO v4.public) that counterparties can verify.

## ⚡ Quickstart

```bash
# Clone and build
git clone https://github.com/openleash/openleash.git && cd openleash
npm install && npm run build

# Start the server (bootstraps ./data and config.yaml)
npx openleash start

# Run the interactive setup wizard
npx openleash wizard
```

## 🔧 SDK Usage

```typescript
import { authorize } from '@openleash/sdk-ts';

const result = await authorize({
  openleashUrl: 'http://127.0.0.1:8787',
  agentId: 'my-agent',
  privateKeyB64: process.env.OPENLEASH_AGENT_PRIVATE_KEY_B64!,
  action: {
    action_id: crypto.randomUUID(),
    action_type: 'purchase',
    requested_at: new Date().toISOString(),
    principal: { agent_id: 'my-agent' },
    subject: { principal_id: '<owner-id>' },
    relying_party: { domain: 'example.com', trust_profile: 'LOW' },
    payload: { amount_minor: 5000, currency: 'USD', merchant_domain: 'example.com' },
  },
});

console.log(result);
```

Verify a proof offline:

```typescript
import { verifyProofOffline } from '@openleash/sdk-ts';

const result = await verifyProofOffline({
  token: proofToken,
  publicKeys: [{ kid: 'key-id', public_key_b64: 'base64...' }],
});

console.log(result.valid, result.claims);
```

## 🧪 Playground

Run predefined scenarios to test policy behavior:

```bash
npx openleash playground list
npx openleash playground run small_purchase_allowed
npx openleash playground run large_purchase_requires_approval
```

## 📋 CLI Commands

| Command | Description |
|---|---|
| `openleash start` | Start the server |
| `openleash wizard` | Interactive setup wizard |
| `openleash policy list` | List policies |
| `openleash policy show <id>` | Show policy YAML |
| `openleash policy upsert --owner <id> --file <path>` | Create/update policy |
| `openleash policy validate --file <path>` | Validate policy YAML |
| `openleash playground list` | List scenarios |
| `openleash playground run <name>` | Run a scenario |
| `openleash keys list` | List signing keys |
| `openleash keys rotate` | Rotate signing key |
| `openleash testvectors` | Generate test vectors |

## 🏗️ Architecture

```
packages/
  core/       # Authorization engine, types, crypto, state management
  server/     # Fastify HTTP server, routes, middleware
  gui/        # Server-rendered HTML GUI (admin + owner portal)
  sdk-ts/     # TypeScript SDK for agents and counterparties
  cli/        # CLI commands (start, wizard, policy, playground, keys)
```

Four actor types interact with the API:

| Actor | Auth | Endpoints |
|---|---|---|
| **Public** | None | `/v1/health`, `/v1/public-keys`, `/v1/verify-proof` |
| **Agent** | Ed25519 request signing | `/v1/authorize`, `/v1/agent/*` |
| **Owner** | PASETO session token | `/v1/owner/*` |
| **Admin** | Bearer token / localhost | `/v1/admin/*` |

All state is stored in human-readable files:
- `./data/state.md` — authoritative index (markdown with YAML)
- `./data/owners/` — owner profiles (markdown with YAML frontmatter)
- `./data/agents/` — agent records (markdown with YAML frontmatter)
- `./data/policies/` — policy YAML files
- `./data/keys/` — signing key JSON files
- `./data/approval-requests/` — approval request records
- `./data/invites/` — owner setup invites
- `./data/agent-invites/` — agent registration invites
- `./data/audit.log.jsonl` — append-only audit log

## 🔑 Approval Workflow

When a policy includes a `HUMAN_APPROVAL` obligation, agents must get explicit owner approval:

```
Agent → POST /v1/authorize           → REQUIRE_APPROVAL
Agent → POST /v1/agent/approval-requests  → Creates pending request
Owner → POST /v1/owner/.../approve   → Issues approval token
Agent → POST /v1/authorize (+ token) → ALLOW + proof token
```

Approval tokens are single-use, action-scoped, and time-limited. See [docs/protocol.md](docs/protocol.md) for details.

## 👤 Owner Portal

The owner portal is a self-service web interface where owners can manage their policies, review pending approval requests, and view registered agents. Access it at `/gui/owner/login`.

**Setup flow:**

1. An admin creates an owner via the Admin Dashboard (`/gui/dashboard`) or `npx openleash wizard`
2. The admin generates a setup invite — the GUI produces a copyable setup link
3. The owner opens the link (`/gui/owner/setup?invite_id=...&invite_token=...`) and chooses a passphrase
4. After setup, the owner is offered to create an **agent invite** — a single URL that an agent uses to register itself
5. The owner logs in at `/gui/owner/login` with their Owner Principal ID and passphrase

## 🤖 Agent Registration

Agents register via **invite URLs** created by owners (or admins). The invite URL is self-contained — the agent POSTs its public key and agent ID to it, and receives back its identity, the signing protocol, all available endpoints, and SDK install instructions.

**Using the TypeScript SDK:**

```typescript
import { redeemAgentInvite } from '@openleash/sdk-ts';

const agent = await redeemAgentInvite({
  inviteUrl: process.env.OPENLEASH_AGENT_INVITE_URL!,
  agentId: 'my-agent',
});
// agent.openleash_url, agent.private_key_b64, agent.agent_principal_id, ...
```

Owners can create agent invites from:
- The owner setup page (offered immediately after setting a passphrase)
- The owner agents page (`/gui/owner/agents`)
- The admin agents page (`/gui/agents`)

See [AGENTS.md](AGENTS.md) for the full agent integration guide.

## 🔍 Troubleshooting

### Clock skew errors

If you get `TIMESTAMP_SKEW` errors, ensure the requesting system's clock is synchronized. The default allowed skew is ±120 seconds. Adjust in `config.yaml`:

```yaml
security:
  clock_skew_seconds: 300
```

### Nonce replay errors

Each nonce can only be used once per agent within the TTL window (default 600 seconds). Generate a unique nonce (UUID) for each request.

### Invalid signature errors

- Ensure you're using the correct private key (PKCS8 DER base64 format)
- The signing input must be exactly: `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256`
- The body SHA256 must match the raw request body bytes

### Admin token confusion

- Default admin mode is `localhost_or_token`: localhost requests bypass token check
- If accessing remotely, you need `admin.allow_remote_admin: true` and a valid bearer token
- Token is stored in `config.yaml` under `admin.token`

### Data folder location

OpenLeash stores all state in `./data/` relative to where you run the command. Make sure you run all commands from the same directory.

## 🤝 Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## 📄 License

[Apache-2.0](LICENSE)
