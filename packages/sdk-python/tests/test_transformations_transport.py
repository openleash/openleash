import hashlib
import json

import httpx
import pytest
from openleash import get_transformations, report_transformation_results, create_transformation_draft, list_transformation_drafts
from openleash.client import generate_ed25519_keypair


@pytest.mark.asyncio
async def test_transformation_transport_signs_and_preserves_results(monkeypatch):
    requests = []
    original = httpx.AsyncClient
    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"protocol_version": 1, "transformations": [], "report_token": "snapshot"})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    key = generate_ed25519_keypair()
    credentials = dict(openleash_url="http://example.test/", agent_id="agent", private_key_b64=key["private_key_b64"])
    plan = await get_transformations(**credentials)
    assert plan["report_token"] == "snapshot"
    await report_transformation_results(**credentials, report={"report_token": "snapshot", "tool_call_id": "call", "outcome": "completed", "results": []})
    await create_transformation_draft(**credentials, rule={"type": "cap_output_length", "max_lines": 2}, justification="Limit size")
    await list_transformation_drafts(**credentials)
    assert [r.method for r in requests] == ["GET", "POST", "POST", "GET"]
    assert len({r.headers["X-Nonce"] for r in requests}) == 4
    for request in requests:
        assert request.headers["X-Agent-Id"] == "agent"
        assert request.headers["X-Body-Sha256"] == hashlib.sha256(request.content or b"{}").hexdigest()
    assert json.loads(requests[2].content)["justification"] == "Limit size"


@pytest.mark.asyncio
async def test_transformation_transport_raises_http_errors(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(lambda request: httpx.Response(503)), **kw))
    key = generate_ed25519_keypair()
    with pytest.raises(httpx.HTTPStatusError):
        await get_transformations(openleash_url="http://example.test", agent_id="agent", private_key_b64=key["private_key_b64"])
