---
paths:
  - "packages/server/**"
---

# @openleash/server

Fastify HTTP server. Depends on `@openleash/core`.

## Structure

- `server.ts` — `createServer()` sets up Fastify with raw body parsing (needed for signature verification) and registers all route modules.
- `routes/` — Each file exports a `registerXxxRoutes(app, dataDir, ...)` function. Core endpoint is `authorize.ts` (POST /v1/authorize).
- `middleware/agent-auth.ts` — Verifies signed requests using X-Timestamp, X-Nonce, X-Signature, X-Body-Sha256 headers. Looked up by X-Agent-Id.
- `middleware/admin-auth.ts` — Bearer token or localhost check for admin routes.
- `bootstrap.ts` — First-run initialization of the `data/` directory.
- `config.ts` — Loads `config.yaml` from project root.

## Patterns

- Routes receive `dataDir` (path to `./data`) and read state via `@openleash/core` state functions.
- Raw body is attached to the request object as `rawBody` for signature verification.
- Error responses follow: `{ error: { code, message, details? } }`.
