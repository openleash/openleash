// Package openleash provides a Go SDK for the OpenLeash authorization + proof sidecar.
package openleash

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"aidanwoods.dev/go-paseto"
)

// Keypair holds base64-encoded DER keys (SPKI for public, PKCS8 for private).
type Keypair struct {
	PublicKeyB64  string `json:"public_key_b64"`
	PrivateKeyB64 string `json:"private_key_b64"`
}

// SignedHeaders holds the headers produced by SignRequest.
type SignedHeaders struct {
	XTimestamp  string `json:"X-Timestamp"`
	XNonce      string `json:"X-Nonce"`
	XBodySha256 string `json:"X-Body-Sha256"`
	XSignature  string `json:"X-Signature"`
}

// RegistrationChallengeResponse is the response from a registration challenge request.
type RegistrationChallengeResponse struct {
	ChallengeID  string `json:"challenge_id"`
	ChallengeB64 string `json:"challenge_b64"`
	ExpiresAt    string `json:"expires_at"`
}

// RegisterAgentResponse is the response from an agent registration request.
type RegisterAgentResponse struct {
	AgentPrincipalID string `json:"agent_principal_id"`
	AgentID          string `json:"agent_id"`
	OwnerPrincipalID string `json:"owner_principal_id"`
	Status           string `json:"status"`
	CreatedAt        string `json:"created_at"`
}

// RedeemInviteResponse is the response from redeeming an agent invite.
type RedeemInviteResponse struct {
	AgentPrincipalID string                 `json:"agent_principal_id"`
	AgentID          string                 `json:"agent_id"`
	OwnerPrincipalID string                 `json:"owner_principal_id"`
	OpenleashURL     string                 `json:"openleash_url"`
	PublicKeyB64     string                 `json:"public_key_b64"`
	PrivateKeyB64    string                 `json:"private_key_b64"`
	Auth             map[string]interface{} `json:"auth"`
	Endpoints        map[string]interface{} `json:"endpoints"`
	Sdks             map[string]interface{} `json:"sdks"`
}

// AgentSelfResponse is the response from GET /v1/agent/self.
type AgentSelfResponse struct {
	AgentPrincipalID string                 `json:"agent_principal_id"`
	AgentID          string                 `json:"agent_id"`
	OwnerPrincipalID string                 `json:"owner_principal_id"`
	Status           string                 `json:"status"`
	Attributes       map[string]interface{} `json:"attributes"`
	CreatedAt        string                 `json:"created_at"`
}

// ApprovalRequestResponse is the response from approval request endpoints.
type ApprovalRequestResponse struct {
	ApprovalRequestID      string `json:"approval_request_id"`
	Status                 string `json:"status"`
	ExpiresAt              string `json:"expires_at,omitempty"`
	ApprovalToken          string `json:"approval_token,omitempty"`
	ApprovalTokenExpiresAt string `json:"approval_token_expires_at,omitempty"`
}

// PolicyDraftResponse is the response from creating a policy draft.
type PolicyDraftResponse struct {
	PolicyDraftID string `json:"policy_draft_id"`
	Status        string `json:"status"`
	CreatedAt     string `json:"created_at"`
}

// PolicyDraftDetail is the full detail of a policy draft.
type PolicyDraftDetail struct {
	PolicyDraftID              string  `json:"policy_draft_id"`
	Status                     string  `json:"status"`
	PolicyYaml                 string  `json:"policy_yaml"`
	AppliesToAgentPrincipalID  *string `json:"applies_to_agent_principal_id"`
	Justification              *string `json:"justification"`
	CreatedAt                  string  `json:"created_at"`
	ResolvedAt                 *string `json:"resolved_at"`
	DenialReason               *string `json:"denial_reason"`
	ResultingPolicyID          *string `json:"resulting_policy_id"`
}

// PolicyDraftListResponse is the response from listing policy drafts.
type PolicyDraftListResponse struct {
	PolicyDrafts []PolicyDraftDetail `json:"policy_drafts"`
}

// VerifyResult is the result of a proof verification.
type VerifyResult struct {
	Valid  bool                   `json:"valid"`
	Reason string                `json:"reason,omitempty"`
	Claims map[string]interface{} `json:"claims,omitempty"`
}

// PublicKeyInfo holds a key ID and its base64-encoded DER SPKI public key.
type PublicKeyInfo struct {
	KID          string `json:"kid"`
	PublicKeyB64 string `json:"public_key_b64"`
}

// GenerateEd25519Keypair generates a new Ed25519 keypair.
// Returns base64-encoded DER SPKI (public) and PKCS8 (private) keys.
func GenerateEd25519Keypair() (Keypair, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return Keypair{}, fmt.Errorf("generate key: %w", err)
	}

	pubDER, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return Keypair{}, fmt.Errorf("marshal public key: %w", err)
	}

	privDER, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return Keypair{}, fmt.Errorf("marshal private key: %w", err)
	}

	return Keypair{
		PublicKeyB64:  base64.StdEncoding.EncodeToString(pubDER),
		PrivateKeyB64: base64.StdEncoding.EncodeToString(privDER),
	}, nil
}

// SignRequest signs an HTTP request with Ed25519.
func SignRequest(method, path, timestamp, nonce string, bodyBytes []byte, privateKeyB64 string) (SignedHeaders, error) {
	bodySha256 := sha256Hex(bodyBytes)
	signingInput := strings.Join([]string{method, path, timestamp, nonce, bodySha256}, "\n")

	privKey, err := loadPrivateKey(privateKeyB64)
	if err != nil {
		return SignedHeaders{}, err
	}

	signature := ed25519.Sign(privKey, []byte(signingInput))

	return SignedHeaders{
		XTimestamp:  timestamp,
		XNonce:      nonce,
		XBodySha256: bodySha256,
		XSignature:  base64.StdEncoding.EncodeToString(signature),
	}, nil
}

// RegistrationChallenge requests a registration challenge from the OpenLeash server.
func RegistrationChallenge(openleashURL, agentID, agentPubKeyB64 string, ownerPrincipalID *string) (RegistrationChallengeResponse, error) {
	body := map[string]interface{}{
		"agent_id":         agentID,
		"agent_pubkey_b64": agentPubKeyB64,
	}
	if ownerPrincipalID != nil {
		body["owner_principal_id"] = *ownerPrincipalID
	}

	var result RegistrationChallengeResponse
	if err := postJSON(openleashURL+"/v1/agents/registration-challenge", body, nil, &result); err != nil {
		return RegistrationChallengeResponse{}, fmt.Errorf("registration challenge: %w", err)
	}
	return result, nil
}

// RegisterAgent registers an agent with the OpenLeash server.
func RegisterAgent(openleashURL, challengeID, agentID, agentPubKeyB64, signatureB64, ownerPrincipalID string) (RegisterAgentResponse, error) {
	body := map[string]interface{}{
		"challenge_id":      challengeID,
		"agent_id":          agentID,
		"agent_pubkey_b64":  agentPubKeyB64,
		"signature_b64":     signatureB64,
		"owner_principal_id": ownerPrincipalID,
	}

	var result RegisterAgentResponse
	if err := postJSON(openleashURL+"/v1/agents/register", body, nil, &result); err != nil {
		return RegisterAgentResponse{}, fmt.Errorf("register agent: %w", err)
	}
	return result, nil
}

// RedeemAgentInvite registers an agent using an invite URL.
// Generates a fresh Ed25519 keypair and registers via the invite token.
func RedeemAgentInvite(inviteURL, agentID string) (RedeemInviteResponse, error) {
	parsed, err := url.Parse(inviteURL)
	if err != nil {
		return RedeemInviteResponse{}, fmt.Errorf("parse invite URL: %w", err)
	}

	inviteID := parsed.Query().Get("invite_id")
	inviteToken := parsed.Query().Get("invite_token")
	if inviteID == "" || inviteToken == "" {
		return RedeemInviteResponse{}, fmt.Errorf("invalid invite URL: missing invite_id or invite_token")
	}

	openleashURL := parsed.Scheme + "://" + parsed.Host

	keypair, err := GenerateEd25519Keypair()
	if err != nil {
		return RedeemInviteResponse{}, fmt.Errorf("generate keypair: %w", err)
	}

	body := map[string]interface{}{
		"invite_id":       inviteID,
		"invite_token":    inviteToken,
		"agent_id":        agentID,
		"agent_pubkey_b64": keypair.PublicKeyB64,
	}

	var serverResult map[string]interface{}
	if err := postJSON(openleashURL+"/v1/agents/register-with-invite", body, nil, &serverResult); err != nil {
		return RedeemInviteResponse{}, fmt.Errorf("redeem agent invite: %w", err)
	}

	result := RedeemInviteResponse{
		PublicKeyB64:  keypair.PublicKeyB64,
		PrivateKeyB64: keypair.PrivateKeyB64,
	}
	// Re-marshal and unmarshal to populate the struct fields from server response
	raw, _ := json.Marshal(serverResult)
	_ = json.Unmarshal(raw, &result)
	result.PublicKeyB64 = keypair.PublicKeyB64
	result.PrivateKeyB64 = keypair.PrivateKeyB64
	return result, nil
}

// Authorize sends a signed authorization request to the OpenLeash server.
func Authorize(openleashURL, agentID, privateKeyB64 string, action map[string]interface{}) (map[string]interface{}, error) {
	bodyBytes, err := json.Marshal(action)
	if err != nil {
		return nil, fmt.Errorf("marshal action: %w", err)
	}

	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.000") + "Z"
	nonce := newUUID()

	headers, err := SignRequest("POST", "/v1/authorize", timestamp, nonce, bodyBytes, privateKeyB64)
	if err != nil {
		return nil, err
	}

	extraHeaders := map[string]string{
		"Content-Type":  "application/json",
		"X-Agent-Id":    agentID,
		"X-Timestamp":   headers.XTimestamp,
		"X-Nonce":       headers.XNonce,
		"X-Body-Sha256": headers.XBodySha256,
		"X-Signature":   headers.XSignature,
	}

	var result map[string]interface{}
	if err := postRaw(openleashURL+"/v1/authorize", bodyBytes, extraHeaders, &result); err != nil {
		return nil, fmt.Errorf("authorize: %w", err)
	}
	return result, nil
}

// VerifyProofOnline verifies a proof token via the OpenLeash server.
func VerifyProofOnline(openleashURL, token string, expectedActionHash, expectedAgentID *string) (VerifyResult, error) {
	body := map[string]interface{}{
		"token": token,
	}
	if expectedActionHash != nil {
		body["expected_action_hash"] = *expectedActionHash
	}
	if expectedAgentID != nil {
		body["expected_agent_id"] = *expectedAgentID
	}

	var result VerifyResult
	if err := postJSON(openleashURL+"/v1/verify-proof", body, nil, &result); err != nil {
		return VerifyResult{}, fmt.Errorf("verify proof online: %w", err)
	}
	return result, nil
}

// VerifyProofOffline verifies a PASETO v4.public proof token locally.
func VerifyProofOffline(token string, publicKeys []PublicKeyInfo) VerifyResult {
	for _, keyInfo := range publicKeys {
		pubKey, err := loadPublicKey(keyInfo.PublicKeyB64)
		if err != nil {
			continue
		}

		parser := paseto.NewParserWithoutExpiryCheck()
		pasetoKey, err := paseto.NewV4AsymmetricPublicKeyFromEd25519(pubKey)
		if err != nil {
			continue
		}

		parsed, err := parser.ParseV4Public(pasetoKey, token, nil)
		if err != nil {
			continue
		}

		claims := parsed.ClaimsJSON()
		var claimsMap map[string]interface{}
		if err := json.Unmarshal(claims, &claimsMap); err != nil {
			continue
		}

		// Check expiration manually
		if expStr, ok := claimsMap["exp"].(string); ok {
			expTime, err := time.Parse(time.RFC3339Nano, expStr)
			if err == nil && expTime.Before(time.Now()) {
				return VerifyResult{Valid: false, Reason: "Token expired", Claims: claimsMap}
			}
		}

		return VerifyResult{Valid: true, Claims: claimsMap}
	}

	return VerifyResult{Valid: false, Reason: "No matching key found or invalid signature"}
}

// GetAgentSelf retrieves the authenticated agent's own info.
func GetAgentSelf(openleashURL, agentID, privateKeyB64 string) (AgentSelfResponse, error) {
	var result AgentSelfResponse
	if err := signedGet(openleashURL, "/v1/agent/self", agentID, privateKeyB64, &result); err != nil {
		return AgentSelfResponse{}, fmt.Errorf("get agent self: %w", err)
	}
	return result, nil
}

// CreateApprovalRequest creates an approval request for an action that requires human approval.
func CreateApprovalRequest(openleashURL, agentID, privateKeyB64, decisionID string, action map[string]interface{}, justification *string, context map[string]interface{}) (ApprovalRequestResponse, error) {
	body := map[string]interface{}{
		"decision_id": decisionID,
		"action":      action,
	}
	if justification != nil {
		body["justification"] = *justification
	}
	if context != nil {
		body["context"] = context
	}

	var result ApprovalRequestResponse
	if err := signedPost(openleashURL, "/v1/agent/approval-requests", agentID, privateKeyB64, body, &result); err != nil {
		return ApprovalRequestResponse{}, fmt.Errorf("create approval request: %w", err)
	}
	return result, nil
}

// GetApprovalRequest gets the status of an approval request.
func GetApprovalRequest(openleashURL, agentID, privateKeyB64, approvalRequestID string) (ApprovalRequestResponse, error) {
	var result ApprovalRequestResponse
	urlPath := "/v1/agent/approval-requests/" + approvalRequestID
	if err := signedGet(openleashURL, urlPath, agentID, privateKeyB64, &result); err != nil {
		return ApprovalRequestResponse{}, fmt.Errorf("get approval request: %w", err)
	}
	return result, nil
}

// PollApprovalRequest polls an approval request until resolved or timeout.
// Default interval is 5s, default timeout is 300s.
func PollApprovalRequest(openleashURL, agentID, privateKeyB64, approvalRequestID string, intervalSeconds, timeoutSeconds float64) (ApprovalRequestResponse, error) {
	if intervalSeconds <= 0 {
		intervalSeconds = 5
	}
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}

	start := time.Now()
	for time.Since(start).Seconds() < timeoutSeconds {
		result, err := GetApprovalRequest(openleashURL, agentID, privateKeyB64, approvalRequestID)
		if err != nil {
			return ApprovalRequestResponse{}, err
		}
		if result.Status != "PENDING" {
			return result, nil
		}
		time.Sleep(time.Duration(intervalSeconds * float64(time.Second)))
	}

	return ApprovalRequestResponse{}, fmt.Errorf("approval request polling timed out after %.0fs", timeoutSeconds)
}

// CreatePolicyDraft submits a policy draft for owner review.
// When appliesToAgentPrincipalID is nil and includeAppliesTo is false, the server
// defaults to the requesting agent. Pass nil with includeAppliesTo=true to target all agents.
func CreatePolicyDraft(openleashURL, agentID, privateKeyB64, policyYaml string, appliesToAgentPrincipalID *string, includeAppliesTo bool, justification *string) (PolicyDraftResponse, error) {
	body := map[string]interface{}{
		"policy_yaml": policyYaml,
	}
	if appliesToAgentPrincipalID != nil {
		body["applies_to_agent_principal_id"] = *appliesToAgentPrincipalID
	} else if includeAppliesTo {
		body["applies_to_agent_principal_id"] = nil
	}
	if justification != nil {
		body["justification"] = *justification
	}

	var result PolicyDraftResponse
	if err := signedPost(openleashURL, "/v1/agent/policy-drafts", agentID, privateKeyB64, body, &result); err != nil {
		return PolicyDraftResponse{}, fmt.Errorf("create policy draft: %w", err)
	}
	return result, nil
}

// GetPolicyDraft gets the details of a policy draft.
func GetPolicyDraft(openleashURL, agentID, privateKeyB64, policyDraftID string) (PolicyDraftDetail, error) {
	var result PolicyDraftDetail
	urlPath := "/v1/agent/policy-drafts/" + policyDraftID
	if err := signedGet(openleashURL, urlPath, agentID, privateKeyB64, &result); err != nil {
		return PolicyDraftDetail{}, fmt.Errorf("get policy draft: %w", err)
	}
	return result, nil
}

// ListPolicyDrafts lists policy drafts submitted by this agent.
// Pass an empty string for status to list all drafts.
func ListPolicyDrafts(openleashURL, agentID, privateKeyB64, status string) (PolicyDraftListResponse, error) {
	urlPath := "/v1/agent/policy-drafts"
	if status != "" {
		urlPath = "/v1/agent/policy-drafts?status=" + url.QueryEscape(status)
	}

	var result PolicyDraftListResponse
	if err := signedGet(openleashURL, urlPath, agentID, privateKeyB64, &result); err != nil {
		return PolicyDraftListResponse{}, fmt.Errorf("list policy drafts: %w", err)
	}
	return result, nil
}

// ── Internal helpers ────────────────────────────────────────────────

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func loadPrivateKey(b64 string) (ed25519.PrivateKey, error) {
	der, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("decode private key base64: %w", err)
	}
	key, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, fmt.Errorf("parse PKCS8 private key: %w", err)
	}
	edKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key is not Ed25519")
	}
	return edKey, nil
}

func loadPublicKey(b64 string) (ed25519.PublicKey, error) {
	der, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("decode public key base64: %w", err)
	}
	key, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, fmt.Errorf("parse SPKI public key: %w", err)
	}
	edKey, ok := key.(ed25519.PublicKey)
	if !ok {
		return nil, fmt.Errorf("key is not Ed25519")
	}
	return edKey, nil
}

func newUUID() string {
	var uuid [16]byte
	_, _ = rand.Read(uuid[:])
	uuid[6] = (uuid[6] & 0x0f) | 0x40 // version 4
	uuid[8] = (uuid[8] & 0x3f) | 0x80 // variant 1
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		uuid[0:4], uuid[4:6], uuid[6:8], uuid[8:10], uuid[10:16])
}

func signedHeaders(method, path, agentID, privateKeyB64 string, bodyBytes []byte) (map[string]string, error) {
	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.000") + "Z"
	nonce := newUUID()

	headers, err := SignRequest(method, path, timestamp, nonce, bodyBytes, privateKeyB64)
	if err != nil {
		return nil, err
	}

	return map[string]string{
		"Content-Type":  "application/json",
		"X-Agent-Id":    agentID,
		"X-Timestamp":   headers.XTimestamp,
		"X-Nonce":       headers.XNonce,
		"X-Body-Sha256": headers.XBodySha256,
		"X-Signature":   headers.XSignature,
	}, nil
}

func signedPost(openleashURL, path, agentID, privateKeyB64 string, body map[string]interface{}, result interface{}) error {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal body: %w", err)
	}

	hdrs, err := signedHeaders("POST", path, agentID, privateKeyB64, bodyBytes)
	if err != nil {
		return err
	}

	return postRaw(openleashURL+path, bodyBytes, hdrs, result)
}

func signedGet(openleashURL, path, agentID, privateKeyB64 string, result interface{}) error {
	bodyBytes := []byte("{}")

	hdrs, err := signedHeaders("GET", path, agentID, privateKeyB64, bodyBytes)
	if err != nil {
		return err
	}

	return doGet(openleashURL+path, hdrs, result)
}

func postJSON(url string, body map[string]interface{}, extraHeaders map[string]string, result interface{}) error {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return err
	}
	return postRaw(url, bodyBytes, extraHeaders, result)
}

func postRaw(url string, bodyBytes []byte, extraHeaders map[string]string, result interface{}) error {
	req, err := http.NewRequest("POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	if extraHeaders == nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}

	return doHTTP(req, result)
}

func doGet(url string, headers map[string]string, result interface{}) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	return doHTTP(req, result)
}

func doHTTP(req *http.Request, result interface{}) error {
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return json.Unmarshal(respBody, result)
}
