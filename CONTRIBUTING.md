# Contributing to openleash

Thanks for your interest in contributing! Here's how to get involved.

## How to contribute

- **Found a bug?** Open an [issue](https://github.com/openleash/openleash/issues/new?template=bug_report.yml).
- **Have a feature idea?** Start a conversation in [Discussions](https://github.com/openleash/openleash/discussions).
- **Small fix or improvement?** Open a pull request directly.

## Development setup

```bash
git clone https://github.com/openleash/openleash.git
cd openleash
npm install
npm run build
npm test
```

## Before you PR

1. **Run tests locally** — `npm test` must pass.
2. **Run the linter** — `npm run lint` must pass.
3. **Keep PRs focused** — one concern per PR. If your change does two unrelated things, split it.
4. **Write tests** for new functionality when possible.

## Commit style

We use a conventional-ish commit style:

```
feat: add new policy validation rule
fix: handle missing nonce in signature check
docs: update quickstart instructions
chore: bump dependencies
```

The type prefix (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`) helps with changelog generation.

## AI-generated PRs

AI-generated contributions are welcome. If your PR was written with AI assistance, please note that in the PR description for transparency. The same quality bar applies — tests must pass, code must be clean, and the PR should be focused.

## Report a vulnerability

Please do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.
