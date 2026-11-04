"""The voice assistant: off without keys, bounded input, real catalog only, audio deleted."""

import io
import json

import httpx
import pytest
from PIL import Image

from app.api.routes import assistant
from app.core.config import get_settings
from app.core.errors import ProviderUnavailable
from app.providers import assemblyai, baseten

REAL_TRANSCRIBE = assemblyai.transcribe

CATALOG = {
    "pieces": [
        {
            "id": "sofa-fabric",
            "name": "Linen sofa",
            "category": "Seating",
            "size_cm": [157, 66, 80],
        },
        {"id": "plant", "name": "Potted plant", "category": "Accents", "size_cm": [70, 66, 84]},
    ],
    "sets": [
        {"id": "living", "name": "Living room set", "pieces": ["Linen sofa"], "floor_m": [4.1, 2.6]}
    ],
}
AUDIO = b"\x00" * 4000


def photo() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 190, 170)).save(buffer, "JPEG")
    return buffer.getvalue()


def hear(client, audio=AUDIO):
    return client.post("/api/assistant/hear", files={"audio": ("q.m4a", audio, "audio/mp4")})


def ask(client, question="Phòng này nên đặt gì?", catalog=None, with_photo=True):
    files = {"photo": ("p.jpg", photo(), "image/jpeg")} if with_photo else None
    data = {"question": question, "language": "vi", "catalog": json.dumps(catalog or CATALOG)}
    return client.post("/api/assistant/ask", data=data, files=files)


def test_off_without_keys(client):
    assert hear(client).status_code == 503
    assert ask(client).json()["error"]["code"] == "assistant_not_configured"
    assert client.post("/api/assistant/warm").status_code == 204
    assert client.get("/api/capabilities").json()["assistant"] is False


@pytest.fixture()
def keys(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "baseten_api", "k")
    monkeypatch.setattr(settings, "assemblyai_api", "a")
    monkeypatch.setattr(assistant, "_per_client", assistant.RateLimiter(100))
    monkeypatch.setattr(assistant, "_hour_count", 0)
    monkeypatch.setattr(assemblyai, "POLL_S", 0)
    calls = {"speech": [], "spark": {}}

    def speech(request):
        calls["speech"].append((request.method, request.url.path))
        if request.url.path == "/v2/upload":
            assert request.headers["authorization"] == "a"
            return httpx.Response(200, json={"upload_url": "https://cdn/x"})
        if request.method == "POST":
            assert json.loads(request.content)["language_detection"] is True
            return httpx.Response(200, json={"id": "t1", "status": "queued"})
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        polls = sum(1 for method, _ in calls["speech"] if method == "GET")
        status = "completed" if polls > 1 else "processing"
        return httpx.Response(
            200, json={"status": status, "text": "Phòng này nên đặt gì?", "language_code": "vi"}
        )

    def spark(request):
        calls["spark"].update(json.loads(request.content))
        reply = {
            "answer": "Một góc sáng, hợp với bộ phòng khách.",
            "seen": ["window", "wooden floor"],
            "suggestions": [
                {"kind": "set", "id": "living", "reason": "Fills an empty room."},
                {"kind": "piece", "id": "invented-sofa", "reason": "Not in the catalog."},
                {"kind": "piece", "id": "plant", "reason": "Softens the corner."},
                {"kind": "piece", "id": "plant", "reason": "Repeated."},
            ],
        }
        body = {"choices": [{"message": {"content": json.dumps(reply)}}]}
        return httpx.Response(200, json=body)

    speech_client = httpx.Client(transport=httpx.MockTransport(speech))
    spark_client = httpx.Client(transport=httpx.MockTransport(spark))
    original_chat = baseten.chat_json
    monkeypatch.setattr(
        assemblyai, "transcribe", lambda audio, client=None: REAL_TRANSCRIBE(audio, speech_client)
    )
    monkeypatch.setattr(
        baseten,
        "chat_json",
        lambda *args, **kwargs: original_chat(*args, **{**kwargs, "client": spark_client}),
    )
    return calls


def test_hears_the_question_and_deletes_the_audio(client, keys):
    body = hear(client).json()
    assert body["question"] == "Phòng này nên đặt gì?"
    assert body["language"] == "vi"
    assert set(body["timings_ms"]) == {"upload", "transcribe"}
    assert ("DELETE", "/v2/transcript/t1") in keys["speech"]


def test_answers_with_only_real_catalog_suggestions(client, keys):
    response = ask(client)
    assert response.status_code == 200
    body = response.json()
    assert [(s["kind"], s["id"]) for s in body["suggestions"]] == [
        ("set", "living"),
        ("piece", "plant"),
    ]
    assert body["question"] == "Phòng này nên đặt gì?"
    assert client.get("/api/capabilities").json()["assistant"] is True


def test_sends_the_photo_with_minimal_reasoning(client, keys):
    ask(client)
    assert keys["spark"]["reasoning_effort"] == "minimal"
    assert any(part["type"] == "image_url" for part in keys["spark"]["messages"][1]["content"])


def test_works_without_a_photo(client, keys):
    assert ask(client, with_photo=False).status_code == 200
    assert not any(part["type"] == "image_url" for part in keys["spark"]["messages"][1]["content"])


def test_rejects_too_long_or_empty_audio(client, keys):
    assert hear(client, audio=b"\x00" * (assistant.MAX_AUDIO_BYTES + 1)).status_code == 413
    assert hear(client, audio=b"\x00" * 10).status_code == 422
    assert keys["speech"] == []


def test_rejects_a_malformed_catalog_or_long_question(client, keys):
    bad = {"pieces": [{"id": "x" * 41, "name": "n", "category": "c", "size_cm": [1, 2, 3]}]}
    assert ask(client, catalog=bad).status_code == 422
    assert ask(client, question="x" * (assistant.MAX_QUESTION_CHARS + 1)).status_code == 422


def test_speech_failure_is_reported_and_still_deletes(monkeypatch):
    monkeypatch.setattr(get_settings(), "assemblyai_api", "a")
    monkeypatch.setattr(assemblyai, "POLL_S", 0)
    seen = []

    def broken(request):
        seen.append((request.method, request.url.path))
        if request.url.path == "/v2/upload":
            return httpx.Response(200, json={"upload_url": "u"})
        if request.method == "POST":
            return httpx.Response(200, json={"id": "t2"})
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        return httpx.Response(200, json={"status": "error"})

    with pytest.raises(ProviderUnavailable):
        REAL_TRANSCRIBE(AUDIO, client=httpx.Client(transport=httpx.MockTransport(broken)))
    assert ("DELETE", "/v2/transcript/t2") in seen


def test_a_connection_that_never_opened_is_retried_once(monkeypatch):
    monkeypatch.setattr(get_settings(), "assemblyai_api", "a")
    monkeypatch.setattr(assemblyai, "POLL_S", 0)
    attempts = {"upload": 0}

    def flaky(request):
        if request.url.path == "/v2/upload":
            attempts["upload"] += 1
            if attempts["upload"] == 1:
                raise httpx.ConnectError("no route", request=request)
            return httpx.Response(200, json={"upload_url": "u"})
        if request.method == "POST":
            return httpx.Response(200, json={"id": "t3"})
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        return httpx.Response(
            200, json={"status": "completed", "text": "Hi", "language_code": "en"}
        )

    heard = REAL_TRANSCRIBE(AUDIO, client=httpx.Client(transport=httpx.MockTransport(flaky)))
    assert heard.text == "Hi"
    assert attempts["upload"] == 2


def test_warm_returns_at_once_and_only_once_a_minute(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "baseten_api", "k")
    monkeypatch.setattr(settings, "assemblyai_api", "a")
    import threading

    monkeypatch.setattr(assistant, "_last_warm", None)
    monkeypatch.setattr(assistant, "_warm_clock", lambda: 10.0)
    signaled = threading.Event()
    started = []

    def warmed():
        started.append(1)
        signaled.set()

    monkeypatch.setattr(assistant, "_warm_providers", warmed)
    assert client.post("/api/assistant/warm").status_code == 204
    assert client.post("/api/assistant/warm").status_code == 204
    assert signaled.wait(timeout=2)
    assert started == [1]
