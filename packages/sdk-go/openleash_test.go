package openleash

import (
	"bytes"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// compactJSON strips whitespace from raw JSON while preserving key order.
// This matches the output of JSON.stringify() in Node.js.
func compactJSON(t *testing.T, raw json.RawMessage) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		t.Fatalf("compact JSON: %v", err)
	}
	return buf.Bytes()
}

type testVectors struct {
	// Use json.RawMessage to preserve original key ordering from the JSON file,
	// since Go's json.Marshal sorts map keys alphabetically but Node/Python don't.
	Action        json.RawMessage        `json:"action"`
	CanonicalJSON string                 `json:"canonical_json"`
	ActionHash    string                 `json:"action_hash"`
	PublicKeyB64  string                 `json:"public_key_b64"`
	PrivateKeyB64 string                `json:"private_key_b64"`
	SigningInput  string                 `json:"signing_input"`
	BodySha256    string                 `json:"body_sha256"`
	SignatureB64  string                 `json:"signature_b64"`
	PasetoToken   string                 `json:"paseto_token"`
	PasetoClaims  map[string]interface{} `json:"paseto_claims"`
}

func loadTestVectors(t *testing.T) testVectors {
	t.Helper()
	data, err := os.ReadFile("testdata/testvectors.json")
	if err != nil {
		t.Fatalf("read testvectors.json: %v", err)
	}
	var v testVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("unmarshal testvectors: %v", err)
	}
	return v
}

func TestGenerateEd25519Keypair(t *testing.T) {
	kp, err := GenerateEd25519Keypair()
	if err != nil {
		t.Fatalf("GenerateEd25519Keypair: %v", err)
	}

	// Public key should be loadable as DER SPKI
	pubDER, err := base64.StdEncoding.DecodeString(kp.PublicKeyB64)
	if err != nil {
		t.Fatalf("decode public key: %v", err)
	}
	pub, err := x509.ParsePKIXPublicKey(pubDER)
	if err != nil {
		t.Fatalf("parse public key: %v", err)
	}
	if _, ok := pub.(ed25519.PublicKey); !ok {
		t.Fatal("public key is not Ed25519")
	}

	// Private key should be loadable as DER PKCS8
	privDER, err := base64.StdEncoding.DecodeString(kp.PrivateKeyB64)
	if err != nil {
		t.Fatalf("decode private key: %v", err)
	}
	priv, err := x509.ParsePKCS8PrivateKey(privDER)
	if err != nil {
		t.Fatalf("parse private key: %v", err)
	}
	if _, ok := priv.(ed25519.PrivateKey); !ok {
		t.Fatal("private key is not Ed25519")
	}
}

func TestSignRequestRoundtrip(t *testing.T) {
	kp, err := GenerateEd25519Keypair()
	if err != nil {
		t.Fatalf("GenerateEd25519Keypair: %v", err)
	}

	body := []byte(`{"hello":"world"}`)
	headers, err := SignRequest("POST", "/v1/authorize", "2024-01-15T10:30:00.000Z", "test-nonce", body, kp.PrivateKeyB64)
	if err != nil {
		t.Fatalf("SignRequest: %v", err)
	}

	if headers.XTimestamp != "2024-01-15T10:30:00.000Z" {
		t.Errorf("timestamp = %q, want %q", headers.XTimestamp, "2024-01-15T10:30:00.000Z")
	}
	if headers.XNonce != "test-nonce" {
		t.Errorf("nonce = %q, want %q", headers.XNonce, "test-nonce")
	}

	// Verify signature
	signingInput := strings.Join([]string{"POST", "/v1/authorize", "2024-01-15T10:30:00.000Z", "test-nonce", headers.XBodySha256}, "\n")
	pubKey, err := loadPublicKey(kp.PublicKeyB64)
	if err != nil {
		t.Fatalf("loadPublicKey: %v", err)
	}
	sig, err := base64.StdEncoding.DecodeString(headers.XSignature)
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	if !ed25519.Verify(pubKey, []byte(signingInput), sig) {
		t.Error("signature verification failed")
	}
}

func TestBodySha256Matches(t *testing.T) {
	v := loadTestVectors(t)
	bodyBytes := compactJSON(t, v.Action)
	got := sha256Hex(bodyBytes)
	if got != v.BodySha256 {
		t.Errorf("body_sha256 = %q, want %q", got, v.BodySha256)
	}
}

func TestSigningInputFormat(t *testing.T) {
	v := loadTestVectors(t)
	parts := strings.Split(v.SigningInput, "\n")
	if len(parts) != 5 {
		t.Fatalf("signing_input has %d parts, want 5", len(parts))
	}
	if parts[0] != "POST" {
		t.Errorf("method = %q, want POST", parts[0])
	}
	if parts[1] != "/v1/authorize" {
		t.Errorf("path = %q, want /v1/authorize", parts[1])
	}
	if parts[4] != v.BodySha256 {
		t.Errorf("body_sha256 = %q, want %q", parts[4], v.BodySha256)
	}
}

func TestEd25519SignatureVerifies(t *testing.T) {
	v := loadTestVectors(t)
	pubKey, err := loadPublicKey(v.PublicKeyB64)
	if err != nil {
		t.Fatalf("loadPublicKey: %v", err)
	}
	sig, err := base64.StdEncoding.DecodeString(v.SignatureB64)
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	if !ed25519.Verify(pubKey, []byte(v.SigningInput), sig) {
		t.Error("known signature did not verify")
	}
}

func TestEd25519SignatureFailsWithWrongData(t *testing.T) {
	v := loadTestVectors(t)
	pubKey, err := loadPublicKey(v.PublicKeyB64)
	if err != nil {
		t.Fatalf("loadPublicKey: %v", err)
	}
	sig, err := base64.StdEncoding.DecodeString(v.SignatureB64)
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	if ed25519.Verify(pubKey, []byte("wrong data"), sig) {
		t.Error("signature should not verify with wrong data")
	}
}

func TestSignRequestProducesKnownSignature(t *testing.T) {
	v := loadTestVectors(t)
	bodyBytes := compactJSON(t, v.Action)

	parts := strings.Split(v.SigningInput, "\n")
	headers, err := SignRequest(parts[0], parts[1], parts[2], parts[3], bodyBytes, v.PrivateKeyB64)
	if err != nil {
		t.Fatalf("SignRequest: %v", err)
	}

	if headers.XBodySha256 != v.BodySha256 {
		t.Errorf("body_sha256 = %q, want %q", headers.XBodySha256, v.BodySha256)
	}
	if headers.XSignature != v.SignatureB64 {
		t.Errorf("signature = %q, want %q", headers.XSignature, v.SignatureB64)
	}
}

func TestPasetoTokenVerifiesAndContainsExpectedClaims(t *testing.T) {
	v := loadTestVectors(t)

	result := VerifyProofOffline(v.PasetoToken, []PublicKeyInfo{
		{KID: v.PasetoClaims["kid"].(string), PublicKeyB64: v.PublicKeyB64},
	})

	// Token is expired (2024-01-15), so valid=false
	if result.Valid {
		t.Error("expected valid=false for expired token")
	}
	if result.Reason != "Token expired" {
		t.Errorf("reason = %q, want %q", result.Reason, "Token expired")
	}
	if result.Claims["iss"] != "openleash" {
		t.Errorf("iss = %v, want openleash", result.Claims["iss"])
	}
	if result.Claims["kid"] != v.PasetoClaims["kid"] {
		t.Errorf("kid = %v, want %v", result.Claims["kid"], v.PasetoClaims["kid"])
	}
	if result.Claims["agent_id"] != v.PasetoClaims["agent_id"] {
		t.Errorf("agent_id = %v, want %v", result.Claims["agent_id"], v.PasetoClaims["agent_id"])
	}
	if result.Claims["action_type"] != v.PasetoClaims["action_type"] {
		t.Errorf("action_type = %v, want %v", result.Claims["action_type"], v.PasetoClaims["action_type"])
	}
	if result.Claims["action_hash"] != v.PasetoClaims["action_hash"] {
		t.Errorf("action_hash = %v, want %v", result.Claims["action_hash"], v.PasetoClaims["action_hash"])
	}
}

func TestVerifyProofOfflineNoMatchingKey(t *testing.T) {
	v := loadTestVectors(t)

	// Generate a different keypair
	kp, err := GenerateEd25519Keypair()
	if err != nil {
		t.Fatalf("GenerateEd25519Keypair: %v", err)
	}

	result := VerifyProofOffline(v.PasetoToken, []PublicKeyInfo{
		{KID: "wrong-key", PublicKeyB64: kp.PublicKeyB64},
	})

	if result.Valid {
		t.Error("expected valid=false for wrong key")
	}
	if result.Reason != "No matching key found or invalid signature" {
		t.Errorf("reason = %q", result.Reason)
	}
}
