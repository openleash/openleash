---
paths:
  - "packages/sdk-ts/**"
---

# @openleash/sdk-ts

Lightweight TypeScript SDK for agents and counterparties. This package is standalone — it does NOT depend on `@openleash/core` or `@openleash/server`.

## Design constraints

- Minimal dependencies: only `paseto` and `json-canonicalize`. Keep it this way.
- Intended for use in agent runtimes — must not pull in server-side code.
- All functions are in a single `src/index.ts` file.

## Public API

- `generateEd25519Keypair()` — Key generation
- `signRequest()` — Signs HTTP requests with Ed25519 (returns X-Timestamp, X-Nonce, X-Body-Sha256, X-Signature headers)
- `authorize()` — Calls /v1/authorize with a signed request
- `registrationChallenge()` / `registerAgent()` — Agent registration flow
- `verifyProofOnline()` / `verifyProofOffline()` — Proof token verification
