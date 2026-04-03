---
paths:
  - "packages/core/**"
---

# @openleash/core

The authorization engine. All other packages depend on this.

## Module responsibilities

- `engine.ts` — `evaluate()` is the main entry point. Matches action_type against policy rules using first-match semantics (iterates all rules for trace, but first match wins).
- `expression.ts` — Evaluates `when` clauses: `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }`, `{ match: { path, op, value } }`. Operators: eq, neq, in, nin, lt, lte, gt, gte, regex, exists.
- `constraints.ts` — Shorthand constraint checks (amount_max, amount_min, currency, allowed_domains, blocked_domains, merchant_domain).
- `obligations.ts` — Computes obligations and maps them to decision results (REQUIRE_APPROVAL, REQUIRE_STEP_UP, REQUIRE_DEPOSIT).
- `policy-parser.ts` — Parses YAML to `Policy` using AJV against `docs/policy.schema.json`.
- `tokens.ts` — PASETO v4.public token issuance and verification using Ed25519 keys.
- `signing.ts` — Ed25519 request signing/verification. Signing input format: `method\npath\ntimestamp\nnonce\nbodySha256`.
- `canonicalize.ts` — RFC 8785 JSON canonical hashing for action_hash.
- `store.ts` — `DataStore` interface + per-entity repository interfaces. This is the storage abstraction layer — all server/CLI code uses `DataStore`.
- `file-store.ts` — `FileDataStore` implements `DataStore` for file-based storage. Factory: `createFileDataStore(dataDir)`.
- `state.ts` — Legacy standalone file I/O functions (all `@deprecated` — use `store.*` instead). `StateIndex` used internally by `FileStateRepository`.
- `types.ts` — All domain types defined as Zod schemas with inferred TypeScript types. Zod schemas and TS types share the same name (e.g., `DecisionResult` is both).
- `audit.ts` — `AuditStore` interface + `FileAuditStore`. Legacy standalone functions `@deprecated`.
- `events.ts` — `OpenleashEvents` typed event emitter. Events: `approval_request.created`, `policy_draft.created`. Passed to plugins via `ServerPluginContext.events`.
- `server-plugin.ts` — `ServerPluginContext`, `ServerPluginManifest`, `CreateServerPlugin`. Manifest supports `extraHeadHtml`/`extraBodyHtml` for injecting HTML into owner pages.

## Conventions

- Types use the Zod-inferred pattern: `export const Foo = z.enum([...]); export type Foo = z.infer<typeof Foo>;`
- JSON fields are snake_case throughout. Policy YAML also uses snake_case.
- All IDs are UUIDs.
