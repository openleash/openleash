import hashlib
import json
import base64

import httpx
import pytest
from cryptography.hazmat.primitives.serialization import load_der_public_key
from openleash import get_transformations, report_transformation_results, create_transformation_draft, list_transformation_drafts, get_transformation_draft
from openleash.client import generate_ed25519_keypair


@pytest.mark.asyncio
async def test_transformation_transport_signs_and_preserves_results(monkeypatch):
    requests = []
    original = httpx.AsyncClient
    draft = {"transformation_draft_id": "draft", "status": "PENDING", "created_at": "2026-10-09T00:00:00Z", "resulting_transformation_id": None}
    def handle(request):
        requests.append(request)
        if request.url.path.endswith("/transformation-drafts"):
            return httpx.Response(200, json=draft if request.method == "POST" else {"transformation_drafts": [draft]})
        if "/transformation-drafts/" in request.url.path:
            return httpx.Response(200, json=draft)
        return httpx.Response(200, json={"protocol_version": 1, "transformations": [], "report_token": "snapshot"})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    key = generate_ed25519_keypair()
    credentials = dict(openleash_url="http://example.test/", agent_id="agent", private_key_b64=key["private_key_b64"])
    plan = await get_transformations(**credentials)
    assert plan["report_token"] == "snapshot"
    await report_transformation_results(**credentials, report={"report_token": "snapshot", "tool_call_id": "call", "outcome": "completed", "results": []})
    created = await create_transformation_draft(**credentials, rule={"type": "cap_output_length", "max_lines": 2}, justification="Limit size")
    assert created["transformation_draft_id"] == "draft"
    assert (await list_transformation_drafts(**credentials))["transformation_drafts"] == [draft]
    assert (await list_transformation_drafts(**credentials, status="PENDING"))["transformation_drafts"] == [draft]
    assert await get_transformation_draft(**credentials, transformation_draft_id="draft") == draft
    assert [r.method for r in requests] == ["GET", "POST", "POST", "GET", "GET", "GET"]
    assert requests[4].url.raw_path == b"/v1/agent/transformation-drafts?status=PENDING"
    assert requests[5].url.path == "/v1/agent/transformation-drafts/draft"
    assert len({r.headers["X-Nonce"] for r in requests}) == 6
    public_key = load_der_public_key(base64.b64decode(key["public_key_b64"]))
    for request in requests:
        assert request.headers["X-Agent-Id"] == "agent"
        assert request.headers["X-Body-Sha256"] == hashlib.sha256(request.content or b"{}").hexdigest()
        signed_input = "\n".join([request.method, request.url.raw_path.decode().split("?", 1)[0], request.headers["X-Timestamp"], request.headers["X-Nonce"], request.headers["X-Body-Sha256"]])
        public_key.verify(base64.b64decode(request.headers["X-Signature"]), signed_input.encode())
    assert json.loads(requests[2].content)["justification"] == "Limit size"


@pytest.mark.asyncio
async def test_transformation_transport_raises_http_errors(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(lambda request: httpx.Response(503)), **kw))
    key = generate_ed25519_keypair()
    with pytest.raises(httpx.HTTPStatusError):
        await get_transformations(openleash_url="http://example.test", agent_id="agent", private_key_b64=key["private_key_b64"])
