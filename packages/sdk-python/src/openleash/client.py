"""OpenLeash SDK — all public functions."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from pyseto import Key, Paseto

# ── Key generation ───────────────────────────────────────────────────


def generate_ed25519_keypair() -> dict[str, str]:
    """Generate an Ed25519 keypair.

    Returns dict with ``public_key_b64`` (DER SPKI) and ``private_key_b64`` (DER PKCS8),
    both base64-encoded.
    """
    import base64

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    public_der = public_key.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    private_der = private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())

    return {
        "public_key_b64": base64.b64encode(public_der).decode(),
        "private_key_b64": base64.b64encode(private_der).decode(),
    }


# ── Request signing ──────────────────────────────────────────────────


def sign_request(
    *,
    method: str,
    path: str,
    timestamp: str,
    nonce: str,
    body_bytes: bytes,
    private_key_b64: str,
) -> dict[str, str]:
    """Sign an HTTP request with Ed25519.

    Returns a dict of headers: X-Timestamp, X-Nonce, X-Body-Sha256, X-Signature.
    """
    import base64

    body_sha256 = hashlib.sha256(body_bytes).hexdigest()
    signing_input = "\n".join([method, path, timestamp, nonce, body_sha256])

    private_key = _load_private_key(private_key_b64)
    signature = private_key.sign(signing_input.encode())

    return {
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Body-Sha256": body_sha256,
        "X-Signature": base64.b64encode(signature).decode(),
    }


# ── Registration challenge ───────────────────────────────────────────


async def registration_challenge(
    *,
    openleash_url: str,
    agent_id: str,
    agent_pubkey_b64: str,
    owner_principal_id: str | None = None,
) -> dict[str, str]:
    """Request a registration challenge from the OpenLeash server.

    Returns dict with ``challenge_id``, ``challenge_b64``, ``expires_at``.
    """
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/agents/registration-challenge",
            json={
                "agent_id": agent_id,
                "agent_pubkey_b64": agent_pubkey_b64,
                "owner_principal_id": owner_principal_id,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Registration challenge failed: {res.text}")
    return res.json()


# ── Register agent ───────────────────────────────────────────────────


async def register_agent(
    *,
    openleash_url: str,
    challenge_id: str,
    agent_id: str,
    agent_pubkey_b64: str,
    signature_b64: str,
    owner_principal_id: str,
) -> dict[str, Any]:
    """Register an agent with the OpenLeash server.

    Returns dict with ``agent_principal_id``, ``agent_id``, ``owner_principal_id``,
    ``status``, ``created_at``.
    """
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/agents/register",
            json={
                "challenge_id": challenge_id,
                "agent_id": agent_id,
                "agent_pubkey_b64": agent_pubkey_b64,
                "signature_b64": signature_b64,
                "owner_principal_id": owner_principal_id,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Agent registration failed: {res.text}")
    return res.json()


# ── Authorize ────────────────────────────────────────────────────────


async def authorize(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    action: dict[str, Any],
) -> dict[str, Any]:
    """Send an authorization request to the OpenLeash server.

    The request is signed with Ed25519. Returns the authorization response.
    """
    body_bytes = json.dumps(action, separators=(",", ":")).encode()
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())

    headers = sign_request(
        method="POST",
        path="/v1/authorize",
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/authorize",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Authorize failed: {res.text}")
    return res.json()


# ── Verify proof online ─────────────────────────────────────────────


async def verify_proof_online(
    *,
    openleash_url: str,
    token: str,
    expected_action_hash: str | None = None,
    expected_agent_id: str | None = None,
) -> dict[str, Any]:
    """Verify a proof token via the OpenLeash server."""
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/verify-proof",
            json={
                "token": token,
                "expected_action_hash": expected_action_hash,
                "expected_agent_id": expected_agent_id,
            },
        )

    return res.json()


# ── Verify proof offline ────────────────────────────────────────────


def verify_proof_offline(
    *,
    token: str,
    public_keys: list[dict[str, str]],
) -> dict[str, Any]:
    """Verify a PASETO v4.public proof token locally.

    Args:
        token: The PASETO v4.public token string.
        public_keys: List of dicts with ``kid`` and ``public_key_b64`` (DER SPKI, base64).

    Returns dict with ``valid``, ``claims`` (if valid), and ``reason`` (if invalid).
    """
    import base64

    from cryptography.hazmat.primitives.serialization import load_der_public_key

    # Use large leeway so pyseto doesn't reject expired tokens — we check exp manually
    paseto = Paseto.new(leeway=999999999)

    for key_info in public_keys:
        try:
            pub_der = base64.b64decode(key_info["public_key_b64"])
            crypto_key = load_der_public_key(pub_der)
            assert isinstance(crypto_key, Ed25519PublicKey)

            pem = crypto_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
            pyseto_key = Key.new(version=4, purpose="public", key=pem)

            decoded = paseto.decode(pyseto_key, token, deserializer=json)
            claims = decoded.payload

            # Check expiration
            if "exp" in claims:
                exp_dt = datetime.fromisoformat(claims["exp"].replace("Z", "+00:00"))
                if exp_dt.timestamp() < datetime.now(timezone.utc).timestamp():
                    return {"valid": False, "reason": "Token expired", "claims": claims}

            return {"valid": True, "claims": claims}
        except Exception:
            continue

    return {"valid": False, "reason": "No matching key found or invalid signature"}


# ── Internal helpers ─────────────────────────────────────────────────


def _load_private_key(private_key_b64: str) -> Ed25519PrivateKey:
    import base64

    from cryptography.hazmat.primitives.serialization import load_der_private_key

    der_bytes = base64.b64decode(private_key_b64)
    key = load_der_private_key(der_bytes, password=None)
    assert isinstance(key, Ed25519PrivateKey)
    return key
