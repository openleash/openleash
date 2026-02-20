# Releasing

Each SDK is versioned independently. Follow the instructions below for each ecosystem.

## TypeScript (`@openleash/core`, `@openleash/server`, `@openleash/cli`, `@openleash/sdk-ts`)

Published to npm. Requires npm 2FA (OTP from authenticator app).

```bash
# Build first
npm run build

# Publish in dependency order: core → gui → server → cli (sdk-ts is standalone)
npm publish --access public -w packages/core
npm publish --access public -w packages/gui
npm publish --access public -w packages/server
npm publish --access public -w packages/cli
npm publish --access public -w packages/sdk-ts
```

Bump versions in each `package.json` before publishing.

## Python (`openleash-sdk`)

Published to PyPI. Requires a PyPI API token.

```bash
cd packages/sdk-python

# Update version in pyproject.toml and src/openleash/__init__.py

# Build
pip install build
python -m build

# Upload (will prompt for API token)
pip install twine
twine upload dist/*
```

## Go (`github.com/openleash/openleash/packages/sdk-go`)

Go modules are served from the Git repository via the Go module proxy. No registry upload needed.

```bash
# Update version in code if applicable, then tag and push
git tag packages/sdk-go/v0.1.0
git push origin packages/sdk-go/v0.1.0
```

The Go proxy will automatically fetch the module from the Git tag. Users install with:

```bash
go get github.com/openleash/openleash/packages/sdk-go@v0.1.0
```
