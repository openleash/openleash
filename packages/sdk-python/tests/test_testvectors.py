"""Cross-language compatibility tests using shared test vectors."""

import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_der_public_key

from openleash import sign_request, verify_proof_offline

VECTORS_PATH = Path(__file__).parent / "fixtures" / "testvectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text())


def test_body_sha256_matches():
    body_bytes = json.dumps(VECTORS["action"], separators=(",", ":")).encode()
    body_sha256 = hashlib.sha256(body_bytes).hexdigest()
    assert body_sha256 == VECTORS["body_sha256"]


def test_signing_input_format():
    parts = VECTORS["signing_input"].split("\n")
    assert len(parts) == 5
    assert parts[0] == "POST"
    assert parts[1] == "/v1/authorize"
    assert parts[4] == VECTORS["body_sha256"]


def test_ed25519_signature_verifies():
    """The known signature from test vectors verifies against the known public key."""
    pub_der = base64.b64decode(VECTORS["public_key_b64"])
    pub_key = load_der_public_key(pub_der)
    assert isinstance(pub_key, Ed25519PublicKey)

    signature = base64.b64decode(VECTORS["signature_b64"])
    signing_input = VECTORS["signing_input"].encode()

    # Will raise InvalidSignature if bad
    pub_key.verify(signature, signing_input)


def test_ed25519_signature_fails_with_wrong_data():
    pub_der = base64.b64decode(VECTORS["public_key_b64"])
    pub_key = load_der_public_key(pub_der)
    assert isinstance(pub_key, Ed25519PublicKey)

    signature = base64.b64decode(VECTORS["signature_b64"])

    import pytest
    with pytest.raises(Exception):
        pub_key.verify(signature, b"wrong data")


def test_sign_request_produces_known_signature():
    """Signing with the known private key produces the known signature."""
    body_bytes = json.dumps(VECTORS["action"], separators=(",", ":")).encode()
    parts = VECTORS["signing_input"].split("\n")

    headers = sign_request(
        method=parts[0],
        path=parts[1],
        timestamp=parts[2],
        nonce=parts[3],
        body_bytes=body_bytes,
        private_key_b64=VECTORS["private_key_b64"],
    )

    assert headers["X-Body-Sha256"] == VECTORS["body_sha256"]
    assert headers["X-Signature"] == VECTORS["signature_b64"]


def test_paseto_token_verifies_and_contains_expected_claims():
    """The known PASETO token verifies and contains the expected claims."""
    result = verify_proof_offline(
        token=VECTORS["paseto_token"],
        public_keys=[{"kid": VECTORS["paseto_claims"]["kid"], "public_key_b64": VECTORS["public_key_b64"]}],
    )

    # Token is expired (2024-01-15), so valid=False with reason="Token expired"
    assert result["valid"] is False
    assert result["reason"] == "Token expired"
    assert result["claims"]["iss"] == "openleash"
    assert result["claims"]["kid"] == VECTORS["paseto_claims"]["kid"]
    assert result["claims"]["iat"] == VECTORS["paseto_claims"]["iat"]
    assert result["claims"]["exp"] == VECTORS["paseto_claims"]["exp"]
    assert result["claims"]["agent_id"] == VECTORS["paseto_claims"]["agent_id"]
    assert result["claims"]["action_type"] == VECTORS["paseto_claims"]["action_type"]
    assert result["claims"]["action_hash"] == VECTORS["paseto_claims"]["action_hash"]
    assert result["claims"]["matched_rule_id"] == VECTORS["paseto_claims"]["matched_rule_id"]
