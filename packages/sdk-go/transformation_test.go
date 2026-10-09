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
	"reflect"
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
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.RequestURI())
		body, _ := io.ReadAll(r.Body)
		if r.Method == "GET" {
			body = []byte("{}")
		}
		hash := sha256.Sum256(body)
		if r.Header.Get("X-Body-Sha256") != hex.EncodeToString(hash[:]) {
			t.Error("wrong body hash")
		}
		input := strings.Join([]string{r.Method, r.URL.EscapedPath(), r.Header.Get("X-Timestamp"), r.Header.Get("X-Nonce"), r.Header.Get("X-Body-Sha256")}, "\n")
		signature, _ := base64.StdEncoding.DecodeString(r.Header.Get("X-Signature"))
		if !ed25519.Verify(key.(ed25519.PublicKey), []byte(input), signature) {
			t.Error("invalid signature")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/agent/transformation-drafts" {
			if r.Method == "POST" {
				_, _ = w.Write([]byte(`{"transformation_draft_id":"draft","status":"PENDING","created_at":"2026-10-09T00:00:00Z"}`))
			} else {
				_, _ = w.Write([]byte(`{"transformation_drafts":[{"transformation_draft_id":"draft","status":"PENDING","resulting_transformation_id":null}]}`))
			}
			return
		}
		if r.URL.Path == "/v1/agent/transformation-drafts/draft" {
			_, _ = w.Write([]byte(`{"transformation_draft_id":"draft","status":"APPROVED","resulting_transformation_id":"draft"}`))
			return
		}
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
	created, err := CreateTransformationDraft(server.URL, "agent", keys.PrivateKeyB64, map[string]interface{}{"type": "cap_output_length", "max_lines": 1}, "Limit output")
	if err != nil || created.TransformationDraftID != "draft" || created.CreatedAt == "" {
		t.Fatalf("created: %+v, %v", created, err)
	}
	if _, err = ListTransformationDrafts(server.URL, "agent", keys.PrivateKeyB64, ""); err != nil {
		t.Fatal(err)
	}
	listed, err := ListTransformationDrafts(server.URL, "agent", keys.PrivateKeyB64, "PENDING")
	if err != nil || len(listed.TransformationDrafts) != 1 || listed.TransformationDrafts[0].Status != "PENDING" || listed.TransformationDrafts[0].ResultingTransformationID != nil {
		t.Fatalf("listed: %+v, %v", listed, err)
	}
	draft, err := GetTransformationDraft(server.URL, "agent", keys.PrivateKeyB64, "draft")
	if err != nil || draft.ResultingTransformationID == nil || *draft.ResultingTransformationID != "draft" {
		t.Fatalf("draft: %+v, %v", draft, err)
	}
	want := []string{"/v1/agent/transformations", "/v1/agent/transformation-results", "/v1/agent/transformation-drafts", "/v1/agent/transformation-drafts", "/v1/agent/transformation-drafts?status=PENDING", "/v1/agent/transformation-drafts/draft"}
	if !reflect.DeepEqual(paths, want) {
		t.Fatalf("paths: %v", paths)
	}
}
