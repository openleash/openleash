---
paths:
  - "packages/server/**"
---

# @openleash/server

Fastify HTTP server. Depends on `@openleash/core`.

## Structure

- `server.ts` — `createServer({ config, dataDir, store })` sets up Fastify with raw body parsing and registers all route modules. Requires a `DataStore` instance.
- `routes/` — Each file exports a `registerXxxRoutes(app, store, ...)` function. All data access goes through `DataStore`. Core endpoint is `authorize.ts` (POST /v1/authorize).
- `middleware/agent-auth.ts` — `createAgentAuth(config, store, nonceCache)` — verifies signed requests via store.
- `middleware/owner-auth.ts` — `createOwnerAuth(config, store)` — PASETO session token verification via store.
- `middleware/admin-auth.ts` — `createAdminAuth(config, store)` — RBAC: verifies PASETO session with `admin` role, falls back to legacy Bearer token (API-only) and localhost bypass (self-hosted only). Attaches `adminSession { principal_id, auth_method }` to request.
- `bootstrap.ts` — `bootstrapState(rootDir, store?)` — delegates to `store.initialize()` if store provided.
- `config.ts` — Loads `config.yaml` from project root.

## Patterns

- Routes receive `store: DataStore` and access all data through repository interfaces (`store.state`, `store.owners`, `store.agents`, etc.).
- State mutations use `store.state.updateState(s => { ... })` for atomic read-modify-write.
- Raw body is attached to the request object as `rawBody` for signature verification.
- Error responses follow: `{ error: { code, message, details? } }`.
