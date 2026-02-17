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
| `owner_principal_id` | UUID of the owner |
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

## Agent Registration (Challenge-Response)

### Step 1: Request Challenge

```
POST /v1/agents/registration-challenge
{
  "agent_id": "my-agent",
  "agent_pubkey_b64": "<SPKI DER base64>",
  "owner_principal_id": "<uuid>"
}
```

Returns a random challenge with 5-minute expiry.

### Step 2: Register with Signed Challenge

```
POST /v1/agents/register
{
  "challenge_id": "<uuid>",
  "agent_id": "my-agent",
  "agent_pubkey_b64": "<SPKI DER base64>",
  "signature_b64": "<Ed25519 signature over challenge bytes>",
  "owner_principal_id": "<uuid>"
}
```

The server verifies the signature over the raw challenge bytes, creates the agent, and returns the agent principal ID.
