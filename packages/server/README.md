# @openleash/server

HTTP server for [OpenLeash](https://github.com/openleash/openleash) — local-first authorization and proof sidecar for AI agents.

## What's included

- **Fastify HTTP server** on `127.0.0.1:8787`
- **Authorization endpoint** — `POST /v1/authorize`
- **Proof verification** — `POST /v1/verify-proof`
- **Agent registration** — `POST /v1/agents/register`
- **Admin API** — owner management, policy upsert, audit log retrieval
- **Middleware** — agent signature verification, admin auth, request validation
- **Bootstrap** — automatic `./data/` directory and config initialization

## Installation

```bash
npm install @openleash/server
```

## Usage

This package is used internally by `@openleash/cli`. To run the server, use the CLI:

```bash
npx openleash start
```

For agent-side integration, use [`@openleash/sdk-ts`](https://www.npmjs.com/package/@openleash/sdk-ts).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Health check |
| GET | `/v1/public-keys` | Retrieve server public keys |
| POST | `/v1/authorize` | Request authorization decision |
| POST | `/v1/verify-proof` | Verify a proof token |
| POST | `/v1/agents/registration-challenge` | Request registration challenge |
| POST | `/v1/agents/register` | Register a new agent |
| POST | `/v1/admin/owners` | Create owner (admin) |
| POST | `/v1/admin/policies` | Upsert policy (admin) |
| GET | `/v1/admin/audit` | Retrieve audit log (admin) |

## Documentation

See the [OpenLeash README](https://github.com/openleash/openleash) for full documentation.

## License

[Apache-2.0](https://github.com/openleash/openleash/blob/main/LICENSE)
