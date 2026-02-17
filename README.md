<div align="center">

# openleash

**Local-first authorization and proof sidecar for AI agents.**

[![CI](https://img.shields.io/github/actions/workflow/status/openleash/openleash/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/openleash/openleash/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@openleash/core?style=for-the-badge&label=npm)](https://www.npmjs.com/package/@openleash/core)
[![License](https://img.shields.io/github/license/openleash/openleash?style=for-the-badge)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/openleash/openleash?style=for-the-badge)](https://github.com/openleash/openleash/discussions)

[Docs](docs/) &bull; [Getting Started](#quickstart) &bull; [npm](https://www.npmjs.com/org/openleash) &bull; [Discussions](https://github.com/openleash/openleash/discussions)

</div>

---

## What is openleash?

openleash runs locally next to your AI agent runtime. Before an agent takes a side-effectful action (purchases, bookings, sending messages, government submissions), it asks openleash:

1. **Is this agent allowed to do this action right now?**
2. **If allowed, can the agent get a cryptographic proof that others can verify?**

openleash evaluates the request against a YAML policy and returns a decision (`ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, `REQUIRE_DEPOSIT`), a list of obligations, and optionally a short-lived proof token (PASETO v4.public) that counterparties can verify.

## Quickstart

```bash
# Clone and build
git clone https://github.com/openleash/openleash.git && cd openleash
npm install && npm run build

# Start the server (bootstraps ./data and config.yaml)
npx openleash start

# Run the interactive setup wizard
npx openleash wizard
```

## SDK Usage

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

## Playground

Run predefined scenarios to test policy behavior:

```bash
npx openleash playground list
npx openleash playground run small_purchase_allowed
npx openleash playground run large_purchase_requires_approval
```

## CLI Commands

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

## Architecture

```
packages/
  core/       # Authorization engine, types, crypto, state management
  server/     # Fastify HTTP server, routes, middleware
  sdk-ts/     # TypeScript SDK for agents and counterparties
  cli/        # CLI commands (start, wizard, policy, playground, keys)
```

All state is stored in human-readable files:
- `./data/state.md` — authoritative index (markdown with YAML)
- `./data/owners/` — owner profiles (markdown with YAML frontmatter)
- `./data/agents/` — agent records (markdown with YAML frontmatter)
- `./data/policies/` — policy YAML files
- `./data/keys/` — signing key JSON files
- `./data/audit.log.jsonl` — append-only audit log

## Troubleshooting

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

openleash stores all state in `./data/` relative to where you run the command. Make sure you run all commands from the same directory.

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

[Apache-2.0](LICENSE)
