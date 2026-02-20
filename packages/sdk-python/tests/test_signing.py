"""Tests for keypair generation and request signing roundtrip."""

import base64
import hashlib

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_der_public_key

from openleash import generate_ed25519_keypair, sign_request


def test_generate_keypair_returns_valid_keys():
    kp = generate_ed25519_keypair()
    assert "public_key_b64" in kp
    assert "private_key_b64" in kp

    # Public key should be loadable as DER SPKI
    pub_der = base64.b64decode(kp["public_key_b64"])
    pub = load_der_public_key(pub_der)
    assert isinstance(pub, Ed25519PublicKey)


def test_sign_request_roundtrip():
    kp = generate_ed25519_keypair()
    body = b'{"hello":"world"}'

    headers = sign_request(
        method="POST",
        path="/v1/authorize",
        timestamp="2024-01-15T10:30:00.000Z",
        nonce="test-nonce",
        body_bytes=body,
        private_key_b64=kp["private_key_b64"],
    )

    assert headers["X-Timestamp"] == "2024-01-15T10:30:00.000Z"
    assert headers["X-Nonce"] == "test-nonce"
    assert headers["X-Body-Sha256"] == hashlib.sha256(body).hexdigest()

    # Verify signature
    body_sha256 = headers["X-Body-Sha256"]
    signing_input = "\n".join(["POST", "/v1/authorize", "2024-01-15T10:30:00.000Z", "test-nonce", body_sha256])

    pub_der = base64.b64decode(kp["public_key_b64"])
    pub_key = load_der_public_key(pub_der)
    assert isinstance(pub_key, Ed25519PublicKey)

    signature = base64.b64decode(headers["X-Signature"])
    # Will raise InvalidSignature if bad
    pub_key.verify(signature, signing_input.encode())


def test_sign_request_different_keys_produce_different_signatures():
    kp1 = generate_ed25519_keypair()
    kp2 = generate_ed25519_keypair()
    body = b'{"test":true}'

    h1 = sign_request(
        method="GET", path="/test", timestamp="t", nonce="n",
        body_bytes=body, private_key_b64=kp1["private_key_b64"],
    )
    h2 = sign_request(
        method="GET", path="/test", timestamp="t", nonce="n",
        body_bytes=body, private_key_b64=kp2["private_key_b64"],
    )

    assert h1["X-Signature"] != h2["X-Signature"]
    assert h1["X-Body-Sha256"] == h2["X-Body-Sha256"]
