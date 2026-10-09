package openleash

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTransformationTransport(t *testing.T) {
	keys, err := GenerateEd25519Keypair()
	if err != nil {
		t.Fatal(err)
	}
	der, _ := base64.StdEncoding.DecodeString(keys.PublicKeyB64)
	key, _ := x509.ParsePKIXPublicKey(der)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, _ := io.ReadAll(r.Body)
		if r.Method == "GET" {
			body = []byte("{}")
		}
		hash := sha256.Sum256(body)
		if r.Header.Get("X-Body-Sha256") != hex.EncodeToString(hash[:]) {
			t.Error("wrong body hash")
		}
		input := strings.Join([]string{r.Method, r.URL.Path, r.Header.Get("X-Timestamp"), r.Header.Get("X-Nonce"), r.Header.Get("X-Body-Sha256")}, "\n")
		signature, _ := base64.StdEncoding.DecodeString(r.Header.Get("X-Signature"))
		if !ed25519.Verify(key.(ed25519.PublicKey), []byte(input), signature) {
			t.Error("invalid signature")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"protocol_version":1,"transformations":[],"report_token":"snapshot"}`))
	}))
	defer server.Close()
	plan, err := GetTransformations(server.URL, "agent", keys.PrivateKeyB64)
	if err != nil || plan.ReportToken != "snapshot" {
		t.Fatalf("plan: %+v, %v", plan, err)
	}
	err = ReportTransformationResults(server.URL, "agent", keys.PrivateKeyB64, TransformationReport{ReportToken: plan.ReportToken, ToolCallID: "call", Outcome: "completed", Results: []TransformationExecution{}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = CreateTransformationDraft(server.URL, "agent", keys.PrivateKeyB64, map[string]interface{}{"type": "cap_output_length", "max_lines": 1}, "Limit output"); err != nil {
		t.Fatal(err)
	}
	if _, err = ListTransformationDrafts(server.URL, "agent", keys.PrivateKeyB64); err != nil {
		t.Fatal(err)
	}
	if calls != 4 {
		t.Fatalf("got %d calls", calls)
	}
}
