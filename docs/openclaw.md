# Integrating openleash with OpenClaw

openleash is designed to work alongside AI agent runtimes like OpenClaw. The integration point is before any tool call, side effect, or external HTTP call.

## Where to Hook In

In your agent runtime, add an openleash authorization check **before**:
- Any tool call that has side effects
- External HTTP requests (API calls, webhooks)
- Purchases, bookings, or financial transactions
- Communication (email, messaging, notifications)
- Government or regulated submissions

## Code Example

```typescript
import { authorize, generateEd25519Keypair, signRequest } from '@openleash/sdk-ts';

// On agent startup: load or generate keys
const agentId = process.env.OPENLEASH_AGENT_ID!;
const privateKeyB64 = process.env.OPENLEASH_AGENT_PRIVATE_KEY_B64!;
const openleashUrl = process.env.OPENLEASH_URL || 'http://127.0.0.1:8787';

// Before executing a side-effectful action:
async function executeWithAuthorization(
  actionType: string,
  payload: Record<string, unknown>,
  ownerPrincipalId: string,
  relyingParty?: { domain?: string; trust_profile?: string }
) {
  const action = {
    action_id: crypto.randomUUID(),
    action_type: actionType,
    requested_at: new Date().toISOString(),
    principal: { agent_id: agentId },
    subject: { principal_id: ownerPrincipalId },
    relying_party: relyingParty,
    payload,
  };

  const result = await authorize({
    openleashUrl,
    agentId,
    privateKeyB64,
    action,
  });

  switch (result.result) {
    case 'ALLOW':
      // Proceed with the action
      // If result.proof_token is present, pass it to the counterparty
      return { allowed: true, proof: result.proof_token };

    case 'DENY':
      // Do not execute the action
      return { allowed: false, reason: result.reason };

    case 'REQUIRE_APPROVAL':
      // Queue for human approval
      return { allowed: false, pending: 'approval', obligations: result.obligations };

    case 'REQUIRE_STEP_UP':
      // Request higher assurance level from user
      return { allowed: false, pending: 'step_up', obligations: result.obligations };

    case 'REQUIRE_DEPOSIT':
      // Request deposit before proceeding
      return { allowed: false, pending: 'deposit', obligations: result.obligations };
  }
}

// Example usage in an OpenClaw tool handler:
async function handlePurchase(toolCall: { amount: number; currency: string; merchant: string }) {
  const authResult = await executeWithAuthorization(
    'purchase',
    {
      amount_minor: Math.round(toolCall.amount * 100),
      currency: toolCall.currency,
      merchant_domain: toolCall.merchant,
    },
    process.env.OWNER_PRINCIPAL_ID!,
    { domain: toolCall.merchant, trust_profile: 'LOW' }
  );

  if (!authResult.allowed) {
    return `Action denied: ${authResult.reason || 'pending ' + authResult.pending}`;
  }

  // Execute the actual purchase...
  // Pass authResult.proof to the merchant if present
}
```

## Proof Passing to Counterparties

When openleash issues a proof token, pass it to the counterparty (merchant agent, doctor's agent, government portal). The counterparty verifies the proof using openleash's public keys:

```typescript
import { verifyProofOffline } from '@openleash/sdk-ts';

// Counterparty verification
const verification = await verifyProofOffline({
  token: receivedProofToken,
  publicKeys: cachedPublicKeys, // fetched from GET /v1/public-keys
});

if (verification.valid) {
  // Proceed — the action was authorized by openleash
  console.log('Authorized action:', verification.claims.action_type);
  console.log('Action hash:', verification.claims.action_hash);
}
```
