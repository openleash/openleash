# @openleash/core

Core authorization engine for [OpenLeash](https://github.com/openleash/openleash) — local-first authorization and proof sidecar for AI agents.

## What's included

- **Policy engine** — evaluate agent actions against YAML policies
- **Decision types** — `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, `REQUIRE_DEPOSIT`
- **PASETO proof tokens** — issue and verify short-lived v4.public tokens
- **Obligations** — attach requirements (human approval, step-up auth, deposits) to decisions
- **State management** — human-readable file-based storage (markdown + YAML)
- **Types** — full TypeScript types for actions, policies, decisions, and tokens

## Installation

```bash
npm install @openleash/core
```

## Usage

This package is used internally by `@openleash/server` and `@openleash/cli`. For agent-side integration, use [`@openleash/sdk-ts`](https://www.npmjs.com/package/@openleash/sdk-ts) instead.

## Documentation

See the [OpenLeash README](https://github.com/openleash/openleash) for full documentation.

## License

[Apache-2.0](https://github.com/openleash/openleash/blob/main/LICENSE)
