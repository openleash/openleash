# openleash (Go SDK)

Go SDK for [OpenLeash](https://github.com/openleash/openleash) — authorization + proof sidecar for AI agents.

## Install

```bash
go get github.com/openleash/openleash/packages/sdk-go
```

## Quick start

```go
package main

import (
	"fmt"
	"log"

	openleash "github.com/openleash/openleash/packages/sdk-go"
)

func main() {
	// Generate a keypair for your agent
	kp, err := openleash.GenerateEd25519Keypair()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(kp.PublicKeyB64)

	// Authorize an action
	result, err := openleash.Authorize(
		"http://127.0.0.1:8787",
		"my-agent",
		kp.PrivateKeyB64,
		map[string]interface{}{
			"action_type": "purchase",
			"payload": map[string]interface{}{
				"amount_minor": 500,
				"currency":     "USD",
			},
		},
	)
	if err != nil {
		log.Fatal(err)
	}

	// Verify a proof token offline
	token := result["proof_token"].(string)
	verification := openleash.VerifyProofOffline(token, []openleash.PublicKeyInfo{
		{KID: "key-id", PublicKeyB64: kp.PublicKeyB64},
	})
	fmt.Println(verification.Valid)
}
```

## API

| Function | Description |
|---|---|
| `GenerateEd25519Keypair()` | Generate Ed25519 keypair (DER SPKI/PKCS8, base64) |
| `SignRequest(...)` | Sign an HTTP request with Ed25519 |
| `RegistrationChallenge(...)` | Request a registration challenge |
| `RegisterAgent(...)` | Register an agent |
| `Authorize(...)` | Send a signed authorization request |
| `VerifyProofOnline(...)` | Verify a proof token via the server |
| `VerifyProofOffline(...)` | Verify a PASETO v4.public token locally |

## Requirements

- Go 1.22+
- Single external dependency: `aidantwoods.dev/go-paseto`

## License

Apache-2.0
