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
    webhook_url: str,
    webhook_secret: str,
    webhook_auth_token: str,
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
                "webhook_url": webhook_url,
                "webhook_secret": webhook_secret,
                "webhook_auth_token": webhook_auth_token,
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


# ── Redeem agent invite ─────────────────────────────────────────────


async def redeem_agent_invite(
    *,
    invite_url: str,
    agent_id: str,
    webhook_url: str,
    webhook_secret: str,
    webhook_auth_token: str,
) -> dict[str, Any]:
    """Register an agent using an invite URL.

    Generates a fresh Ed25519 keypair and registers via the invite token.
    Returns dict with ``agent_principal_id``, ``agent_id``, ``owner_principal_id``,
    ``openleash_url``, ``public_key_b64``, ``private_key_b64``, ``auth``, ``endpoints``, ``sdks``.
    """
    from urllib.parse import urlparse, parse_qs

    parsed = urlparse(invite_url)
    qs = parse_qs(parsed.query)
    invite_id = qs.get("invite_id", [None])[0]
    invite_token = qs.get("invite_token", [None])[0]

    if not invite_id or not invite_token:
        raise ValueError("Invalid invite URL: missing invite_id or invite_token query parameters")

    openleash_url = f"{parsed.scheme}://{parsed.netloc}"
    keypair = generate_ed25519_keypair()

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/agents/register-with-invite",
            json={
                "invite_id": invite_id,
                "invite_token": invite_token,
                "agent_id": agent_id,
                "agent_pubkey_b64": keypair["public_key_b64"],
                "webhook_url": webhook_url,
                "webhook_secret": webhook_secret,
                "webhook_auth_token": webhook_auth_token,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Agent invite registration failed: {res.text}")

    result = res.json()
    result["public_key_b64"] = keypair["public_key_b64"]
    result["private_key_b64"] = keypair["private_key_b64"]
    return result


# ── Agent self ──────────────────────────────────────────────────────


async def get_agent_self(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
) -> dict[str, Any]:
    """Get the authenticated agent's own info.

    Returns dict with ``agent_principal_id``, ``agent_id``, ``owner_principal_id``,
    ``status``, ``attributes``, ``created_at``.
    """
    body_bytes = b"{}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())

    headers = sign_request(
        method="GET",
        path="/v1/agent/self",
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{openleash_url}/v1/agent/self",
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Get agent self failed: {res.text}")
    return res.json()


# ── Approval requests ───────────────────────────────────────────────


async def create_approval_request(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    decision_id: str,
    action: dict[str, Any],
    justification: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create an approval request for an action that requires human approval.

    Returns dict with ``approval_request_id``, ``status``, ``expires_at``.
    """
    body: dict[str, Any] = {"decision_id": decision_id, "action": action}
    if justification:
        body["justification"] = justification
    if context:
        body["context"] = context

    body_bytes = json.dumps(body, separators=(",", ":")).encode()
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())

    headers = sign_request(
        method="POST",
        path="/v1/agent/approval-requests",
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/agent/approval-requests",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Create approval request failed: {res.text}")
    return res.json()


async def get_approval_request(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    approval_request_id: str,
) -> dict[str, Any]:
    """Get the status of an approval request.

    Returns dict with ``approval_request_id``, ``status``, and optionally
    ``approval_token``, ``approval_token_expires_at`` when approved.
    """
    body_bytes = b"{}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())
    url_path = f"/v1/agent/approval-requests/{approval_request_id}"

    headers = sign_request(
        method="GET",
        path=url_path,
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{openleash_url}{url_path}",
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Get approval request failed: {res.text}")
    return res.json()


async def poll_approval_request(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    approval_request_id: str,
    interval_seconds: float = 5.0,
    timeout_seconds: float = 300.0,
) -> dict[str, Any]:
    """Poll an approval request until it is resolved or times out.

    Returns the approval request status dict. Raises ``TimeoutError`` if polling
    exceeds *timeout_seconds*.
    """
    import asyncio

    start = asyncio.get_event_loop().time()

    while asyncio.get_event_loop().time() - start < timeout_seconds:
        result = await get_approval_request(
            openleash_url=openleash_url,
            agent_id=agent_id,
            private_key_b64=private_key_b64,
            approval_request_id=approval_request_id,
        )
        if result.get("status") != "PENDING":
            return result
        await asyncio.sleep(interval_seconds)

    raise TimeoutError(f"Approval request polling timed out after {timeout_seconds}s")


# ── Policy drafts ──────────────────────────────────────────────────


async def create_policy_draft(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    policy_yaml: str,
    applies_to_agent_principal_id: str | None = ...,  # type: ignore[assignment]
    justification: str | None = None,
) -> dict[str, Any]:
    """Submit a policy draft for owner review.

    Args:
        applies_to_agent_principal_id: The agent principal the policy should
            apply to. Defaults to the requesting agent itself when omitted.
            Pass ``None`` explicitly to propose a policy for all agents.

    Returns dict with ``policy_draft_id``, ``status``, ``created_at``.
    """
    body: dict[str, Any] = {"policy_yaml": policy_yaml}
    if applies_to_agent_principal_id is not ...:
        body["applies_to_agent_principal_id"] = applies_to_agent_principal_id
    if justification:
        body["justification"] = justification

    body_bytes = json.dumps(body, separators=(",", ":")).encode()
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())

    headers = sign_request(
        method="POST",
        path="/v1/agent/policy-drafts",
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{openleash_url}/v1/agent/policy-drafts",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Create policy draft failed: {res.text}")
    return res.json()


async def get_policy_draft(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    policy_draft_id: str,
) -> dict[str, Any]:
    """Get the details of a policy draft.

    Returns dict with ``policy_draft_id``, ``status``, ``policy_yaml``,
    ``applies_to_agent_principal_id``, ``justification``, ``created_at``,
    ``resolved_at``, ``denial_reason``, ``resulting_policy_id``.
    """
    body_bytes = b"{}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())
    url_path = f"/v1/agent/policy-drafts/{policy_draft_id}"

    headers = sign_request(
        method="GET",
        path=url_path,
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{openleash_url}{url_path}",
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"Get policy draft failed: {res.text}")
    return res.json()


async def list_policy_drafts(
    *,
    openleash_url: str,
    agent_id: str,
    private_key_b64: str,
    status: str | None = None,
) -> dict[str, Any]:
    """List policy drafts submitted by this agent.

    Args:
        status: Optional filter — ``'PENDING'``, ``'APPROVED'``, or ``'DENIED'``.

    Returns dict with ``policy_drafts`` list.
    """
    from urllib.parse import quote

    body_bytes = b"{}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    nonce = str(uuid.uuid4())
    url_path = "/v1/agent/policy-drafts"
    if status:
        url_path = f"/v1/agent/policy-drafts?status={quote(status)}"

    headers = sign_request(
        method="GET",
        path=url_path,
        timestamp=timestamp,
        nonce=nonce,
        body_bytes=body_bytes,
        private_key_b64=private_key_b64,
    )

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{openleash_url}{url_path}",
            headers={
                "Content-Type": "application/json",
                "X-Agent-Id": agent_id,
                **headers,
            },
        )

    if res.status_code >= 400:
        raise RuntimeError(f"List policy drafts failed: {res.text}")
    return res.json()


# ── Internal helpers ─────────────────────────────────────────────────


def _load_private_key(private_key_b64: str) -> Ed25519PrivateKey:
    import base64

    from cryptography.hazmat.primitives.serialization import load_der_private_key

    der_bytes = base64.b64decode(private_key_b64)
    key = load_der_private_key(der_bytes, password=None)
    assert isinstance(key, Ed25519PrivateKey)
    return key
