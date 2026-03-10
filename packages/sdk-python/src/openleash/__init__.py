"""OpenLeash Python SDK — authorization + proof sidecar for AI agents."""

__version__ = "0.2.0"

from .client import (
    authorize,
    create_approval_request,
    create_policy_draft,
    generate_ed25519_keypair,
    get_agent_self,
    get_approval_request,
    get_policy_draft,
    list_policy_drafts,
    poll_approval_request,
    redeem_agent_invite,
    register_agent,
    registration_challenge,
    sign_request,
    verify_proof_offline,
    verify_proof_online,
)

__all__ = [
    "authorize",
    "create_approval_request",
    "create_policy_draft",
    "generate_ed25519_keypair",
    "get_agent_self",
    "get_approval_request",
    "get_policy_draft",
    "list_policy_drafts",
    "poll_approval_request",
    "redeem_agent_invite",
    "register_agent",
    "registration_challenge",
    "sign_request",
    "verify_proof_offline",
    "verify_proof_online",
]
