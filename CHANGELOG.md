# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.21.0] - 2026-05-25

### Added

- Within-tier policy ordering. Each binding now carries an optional `rank` (default `100`, lower runs first). The engine sorts bindings by rank within each specificity tier (agent-specific > group > owner-wide); tiers themselves still dominate. `POST /v1/owner/policies` (and the org-scoped variant) assigns the next rank slot (steps of 100) on create.
- `PUT /v1/owner/policies/order` and `PUT /v1/owner/organizations/:orgId/policies/order` to reorder all policies in a tier in one request. Body: `{ tier: "agent" | "group" | "owner_wide", ordered_policy_ids: string[] }`. Server validates the list is a complete permutation of the tier's current policies, rewrites ranks, and writes a `POLICIES_REORDERED` audit event.
- Owner policies GUI now shows three tier sections (Agent-specific / Group / Owner-wide) with native HTML5 drag-and-drop reordering within each section. Tiers cannot be reordered against each other — specificity always wins.

### Changed

- `GET /v1/owner/policies` and `GET /v1/owner/organizations/:orgId/policies` now include `rank` and `applies_to_group_id` on each entry and return policies pre-sorted by tier then rank.

[0.21.0]: https://github.com/openleash/openleash/releases/tag/v0.21.0

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
