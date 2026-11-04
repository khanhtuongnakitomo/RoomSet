"""The architect endpoint: off without a key, schema-bound, and capped."""

import json

import httpx
import pytest

from app.api.routes import studio
from app.core.config import get_settings
from app.providers import baseten

FACTS = {
    "rooms": [{"name": "Living room", "area_m2": 25.8, "coverage_pct": 22, "items": 6}],
    "items": [
        {
            "name": "Linen sofa",
            "room": "Living room",
            "size_cm": [157, 66, 80],
            "rotation_deg": 90,
            "nearest_wall_cm": 7,
            "front_clear_cm": 80,
            "overlaps": [],
        }
    ],
    "rule_findings": [{"severity": "good", "title": "Fine", "detail": "All clear."}],
}


def test_without_a_key_it_reports_not_configured(client):
    response = client.post("/api/studio/advise", json=FACTS)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "spark_not_configured"


def test_rejects_oversized_input(client):
    body = {**FACTS, "items": FACTS["items"] * 61}
    assert client.post("/api/studio/advise", json=body).status_code == 422


@pytest.fixture()
def spark(monkeypatch):
    monkeypatch.setattr(get_settings(), "baseten_api", "k")
    monkeypatch.setattr(studio, "_per_client", studio.RateLimiter(100))
    monkeypatch.setattr(studio, "_hour_count", 0)
    captured = {}

    def handler(request):
        captured.update(json.loads(request.content))
        reply = {
            "summary": "Good bones.",
            "notes": [{"title": "Pull the sofa", "detail": "Add 20 cm."}],
        }
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}]})

    original = baseten.chat_json

    def patched(system, content, schema, max_tokens=4000, client=None, reasoning_effort=None):
        mock = httpx.Client(transport=httpx.MockTransport(handler))
        return original(
            system,
            content,
            schema,
            max_tokens=max_tokens,
            client=mock,
            reasoning_effort=reasoning_effort,
        )

    monkeypatch.setattr(baseten, "chat_json", patched)
    return captured


def test_returns_advice_and_sends_only_the_facts(client, spark):
    response = client.post("/api/studio/advise", json=FACTS)
    assert response.status_code == 200, response.text
    assert response.json()["summary"] == "Good bones."
    assert response.json()["model"]
    sent = spark["messages"][1]["content"][0]["text"]
    assert "Linen sofa" in sent and sent.startswith("<layout>")
    assert spark["messages"][0]["role"] == "system"
    assert spark["max_tokens"] == studio.MAX_REPLY_TOKENS


def test_hourly_budget_stops_spending(client, spark, monkeypatch):
    monkeypatch.setattr(studio, "_hour_count", studio.MAX_PER_HOUR_TOTAL)
    assert client.post("/api/studio/advise", json=FACTS).status_code == 429
    assert "messages" not in spark
