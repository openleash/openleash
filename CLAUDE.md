# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenLeash is a local-first authorization + proof sidecar for AI agents. It evaluates YAML-based policies and issues PASETO v4.public cryptographic proof tokens. The project is a TypeScript monorepo using npm workspaces.

## Commands

```bash
npm install          # Install all workspace dependencies
npm run build        # TypeScript composite build (tsc -b) across all packages
npm test             # Run all tests (vitest run)
npm run dev          # Start dev server with tsx (live reload)
npm run lint         # ESLint across all packages

# Run a single test file
npx vitest run packages/core/test/engine.test.ts

# Run tests matching a pattern
npx vitest run -t "exact action match"

# CLI (after build)
npx openleash start
npx openleash wizard
npx openleash policy list
npx openleash playground run <scenario>
```

## Architecture

### Package dependency graph

```
@openleash/cli → @openleash/server → @openleash/core
@openleash/sdk-ts (standalone, no internal deps)
```

### Packages

- **`packages/core`** — Authorization engine, policy parser, expression evaluator, constraints, obligations, PASETO token issuance/verification, Ed25519 request signing, file-based state management (`./data/`), append-only audit log. Key deps: `paseto`, `zod`, `ajv`, `yaml`, `json-canonicalize`.
- **`packages/server`** — Fastify HTTP server. Routes: `/v1/authorize`, `/v1/verify-proof`, `/v1/agents/register`, `/v1/public-keys`, `/v1/health`, admin API, playground. Middleware for agent request signature verification and admin auth. Key dep: `fastify`.
- **`packages/sdk-ts`** — Lightweight TypeScript SDK for agents and counterparties. Functions: `authorize()`, `signRequest()`, `registerAgent()`, `verifyProofOffline()`, `verifyProofOnline()`, `generateEd25519Keypair()`. Minimal deps (`paseto`, `json-canonicalize`).
- **`packages/cli`** — CLI commands: `start`, `wizard`, `policy`, `playground`, `keys`, `testvectors`. Entry point: `packages/cli/src/index.ts`.

### State storage (`./data/`)

File-based with a `state.md` index (YAML frontmatter). Subdirectories: `owners/`, `agents/`, `policies/`, `keys/`. Audit log: `audit.log.jsonl` (JSONL append-only).

### Domain concepts

- **Decision types**: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, `REQUIRE_DEPOSIT`
- **Obligation types**: `HUMAN_APPROVAL`, `STEP_UP_AUTH`, `DEPOSIT`, `COUNTERPARTY_ATTESTATION`
- IDs are UUIDs. JSON fields use snake_case.

## Code Conventions

- TypeScript strict mode, ES2022 target, Node16 module resolution
- Use `.js` extensions in relative imports (ESM requirement)
- Each package exports via barrel `index.ts`
- Zod for runtime schema validation, AJV for JSON Schema (policy files)
- Tests use vitest (`describe`/`it`/`expect`), located in `packages/*/test/**/*.test.ts`
- ESLint: `@typescript-eslint/no-explicit-any` is warn-level; unused args prefixed `_` are allowed
- Commit style: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` prefixes

## Config

Server configuration lives in `config.yaml` at the project root. Default bind address: `127.0.0.1:8787`.
