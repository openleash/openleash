# @openleash/cli

CLI for [OpenLeash](https://github.com/openleash/openleash) — local-first authorization and proof sidecar for AI agents.

## Installation

```bash
npm install -g @openleash/cli
```

## Quick start

```bash
# Start the server (bootstraps ./data and config.yaml)
openleash start

# Run the interactive setup wizard
openleash wizard

# Test policies with the playground
openleash playground list
openleash playground run small_purchase_allowed
```

## Commands

| Command | Description |
|---------|-------------|
| `openleash start` | Start the server |
| `openleash wizard` | Interactive setup wizard |
| `openleash policy list` | List policies |
| `openleash policy show <id>` | Show policy YAML |
| `openleash policy upsert --owner <id> --file <path>` | Create/update policy |
| `openleash policy validate --file <path>` | Validate policy YAML |
| `openleash playground list` | List scenarios |
| `openleash playground run <name>` | Run a scenario |
| `openleash keys list` | List signing keys |
| `openleash keys rotate` | Rotate signing key |
| `openleash testvectors` | Generate test vectors |

## Documentation

See the [OpenLeash README](https://github.com/openleash/openleash) for full documentation.

## License

[Apache-2.0](https://github.com/openleash/openleash/blob/main/LICENSE)
