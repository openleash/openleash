---
paths:
  - "packages/cli/**"
---

# @openleash/cli

CLI entry point. Depends on `@openleash/core` and `@openleash/server`.

## Structure

- `index.ts` — Manual argument parsing with switch/case (no CLI framework). Dispatches to command handlers.
- `commands/` — Each file exports async command functions. Commands: start, wizard, policy (list/show/upsert/validate), playground (list/run), keys (list/rotate), testvectors.

## Conventions

- The `wizard` command uses the `prompts` library for interactive input.
- The `start` command calls `bootstrapState()` then `createServer()`.
- Data directory defaults to `./data` relative to process.cwd().
