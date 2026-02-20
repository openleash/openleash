"""OpenLeash Python SDK — authorization + proof sidecar for AI agents."""

__version__ = "0.1.0"

from .client import (
    authorize,
    generate_ed25519_keypair,
    register_agent,
    registration_challenge,
    sign_request,
    verify_proof_offline,
    verify_proof_online,
)

__all__ = [
    "authorize",
    "generate_ed25519_keypair",
    "register_agent",
    "registration_challenge",
    "sign_request",
    "verify_proof_offline",
    "verify_proof_online",
]
