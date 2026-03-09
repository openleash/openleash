# @openleash/sdk-ts

TypeScript SDK for [OpenLeash](https://github.com/openleash/openleash) — local-first authorization and proof sidecar for AI agents.

Use this package in your agent code to request authorization and verify proof tokens.

## Installation

```bash
npm install @openleash/sdk-ts
```

## Register with an invite

```typescript
import { redeemAgentInvite } from '@openleash/sdk-ts';

const agent = await redeemAgentInvite({
  inviteUrl: process.env.OPENLEASH_AGENT_INVITE_URL!,
  agentId: 'my-agent',
});

// agent.openleash_url      — server URL
// agent.agent_principal_id — your ID
// agent.private_key_b64    — your private key (generated locally)
// agent.auth               — signing protocol details
// agent.endpoints          — available API endpoints
```

## Authorize an action

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
    payload: { amount_minor: 5000, currency: 'USD' },
  },
});

console.log(result.decision); // "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | ...
console.log(result.proof_token); // PASETO v4.public token (if allowed)
```

## Verify a proof offline

```typescript
import { verifyProofOffline } from '@openleash/sdk-ts';

const result = await verifyProofOffline({
  token: proofToken,
  publicKeys: [{ kid: 'key-id', public_key_b64: 'base64...' }],
});

console.log(result.valid, result.claims);
```

## Documentation

See the [OpenLeash README](https://github.com/openleash/openleash) for full documentation.

## License

[Apache-2.0](https://github.com/openleash/openleash/blob/main/LICENSE)
