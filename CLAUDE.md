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

- **`packages/core`** — Authorization engine, policy parser, expression evaluator, constraints, obligations, PASETO token issuance/verification (proof, session, approval), Ed25519 request signing, passphrase hashing (scrypt), file-based state management (`./data/`), append-only audit log, typed event system (`OpenleashEvents`) for server plugin integration. Key deps: `paseto`, `zod`, `ajv`, `yaml`, `json-canonicalize`.
- **`packages/server`** — Fastify HTTP server. Four API scopes: Public (`/v1/health`, `/v1/public-keys`, `/v1/verify-proof`), Agent (`/v1/authorize`, `/v1/agent/*`), Owner (`/v1/owner/*`), Admin (`/v1/admin/*`), plus playground and GUI. Three auth middlewares: `agent-auth` (Ed25519 signatures), `owner-auth` (PASETO session tokens), `admin-auth` (RBAC: PASETO session with admin role, legacy Bearer token fallback, localhost bypass). Key dep: `fastify`.
- **`packages/gui`** — Server-rendered HTML GUI with Vite-bundled client assets. Two contexts: owner portal (`/gui/*`, default) and admin dashboard (`/gui/admin/*`). Each page is a directory under `src/pages/` containing `render.ts` (server HTML), `client.ts` (browser JS), and `style.css` (page-specific styles). Shared code lives in `src/shared/` (layout, common utilities, manifest resolver, global CSS). Built with `tsc -b` (server) + `vite build` (client). Key dep: `vite`.
- **`packages/sdk-ts`** — Lightweight TypeScript SDK for agents and counterparties. Functions: `authorize()`, `signRequest()`, `registerAgent()`, `verifyProofOffline()`, `verifyProofOnline()`, `generateEd25519Keypair()`, `createApprovalRequest()`, `getApprovalRequest()`, `pollApprovalRequest()`. Minimal deps (`paseto`, `json-canonicalize`).
- **`packages/cli`** — CLI commands: `start`, `wizard`, `policy`, `playground`, `keys`, `testvectors`. Entry point: `packages/cli/src/index.ts`.

### State storage (`./data/`)

File-based with a `state.md` index (YAML frontmatter). Subdirectories: `users/`, `organizations/`, `memberships/`, `agents/`, `policies/`, `keys/`, `approval-requests/`, `invites/`. Audit log: `audit.log.jsonl` (JSONL append-only).

### Domain concepts

- **Decision types**: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, `REQUIRE_DEPOSIT`
- **Obligation types**: `HUMAN_APPROVAL`, `STEP_UP_AUTH`, `DEPOSIT`, `COUNTERPARTY_ATTESTATION`
- **System roles (RBAC)**: `SystemRole` = `'admin'`. Stored in `UserFrontmatter.system_roles` and embedded in PASETO session token claims. Admin auth middleware checks for `admin` role. Legacy admin token and localhost bypass kept as API-only fallbacks. Initial setup grants `['admin']` to the first user. Role management via `GET/PUT /v1/admin/owners/:ownerId/roles`.
- IDs are UUIDs. JSON fields use snake_case.

## Code Conventions

- **Icons**: Use **Google Material Symbols Outlined** exclusively. The CDN is loaded in `packages/gui/src/shared/layout.ts`. Use `<span class="material-symbols-outlined">icon_name</span>` for all icons. Do not use Unicode symbols, emoji HTML entities, FontAwesome, or inline SVG for UI icons. Browse available icons at https://fonts.google.com/icons.
- TypeScript strict mode, ES2022 target, NodeNext module resolution
- Use `.js` extensions in relative imports (ESM requirement)
- Each package exports via barrel `index.ts`
- Zod for runtime schema validation, AJV for JSON Schema (policy files)
- Tests use vitest (`describe`/`it`/`expect`), located in `packages/*/test/**/*.test.ts`
- ESLint: `@typescript-eslint/no-explicit-any` is warn-level; unused args prefixed `_` are allowed
- Commit style: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` prefixes

## Config

Server configuration lives in `config.yaml` at the project root. Default bind address: `127.0.0.1:8787`.
