# openleash-sdk (Python)

Python SDK for [OpenLeash](https://github.com/openleash/openleash) — authorization + proof sidecar for AI agents.

## Install

```bash
pip install openleash-sdk
```

## Quick start

```python
from openleash import (
    authorize,
    generate_ed25519_keypair,
    sign_request,
    verify_proof_offline,
)

# Generate a keypair for your agent
keypair = generate_ed25519_keypair()
print(keypair["public_key_b64"])

# Authorize an action (async)
result = await authorize(
    openleash_url="http://127.0.0.1:8787",
    agent_id="my-agent",
    private_key_b64=keypair["private_key_b64"],
    action={
        "action_type": "purchase",
        "payload": {"amount_minor": 500, "currency": "USD"},
    },
)

# Verify a proof token offline
verification = verify_proof_offline(
    token=result["proof_token"],
    public_keys=[{"kid": "key-id", "public_key_b64": keypair["public_key_b64"]}],
)
```

## API

| Function | Async | Description |
|---|---|---|
| `generate_ed25519_keypair()` | No | Generate Ed25519 keypair (DER SPKI/PKCS8, base64) |
| `sign_request(...)` | No | Sign an HTTP request with Ed25519 |
| `registration_challenge(...)` | Yes | Request a registration challenge |
| `register_agent(...)` | Yes | Register an agent |
| `authorize(...)` | Yes | Send a signed authorization request |
| `verify_proof_online(...)` | Yes | Verify a proof token via the server |
| `verify_proof_offline(...)` | No | Verify a PASETO v4.public token locally |

## Requirements

- Python 3.10+
- Dependencies: `cryptography`, `pyseto`, `httpx`

## License

Apache-2.0
