# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2025-06-01

### Added

- Authorization engine with YAML policy evaluation
- Five decision types: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `REQUIRE_STEP_UP`, `REQUIRE_DEPOSIT`
- PASETO v4.public proof token issuance and verification
- Fastify HTTP server with agent authentication and admin API
- TypeScript SDK (`@openleash/sdk-ts`) for authorization and offline proof verification
- CLI with `start`, `wizard`, `policy`, `playground`, `keys`, and `testvectors` commands
- Interactive setup wizard for owners, agents, and policies
- Policy playground with predefined scenarios
- Human-readable file-based state storage (`./data/`)
- Append-only audit log (`audit.log.jsonl`)

[0.1.0]: https://github.com/openleash/openleash/releases/tag/v0.1.0
