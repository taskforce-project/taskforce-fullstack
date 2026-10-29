import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import create_app
from app.services.provider import ProviderGateway
from app.services.status import ProviderStatus
from tests.conftest import AUTH, http_error, make_client

CHOICE = {"choices": [{"message": {"role": "assistant", "content": "ok"}}], "usage": {"total_tokens": 4}}


def test_vivacite_sans_secret_ni_configuration(provider):
    body = make_client(provider).get("/health").json()
    assert body["status"] == "ok"
    assert "model" not in str(body)


@pytest.mark.parametrize(
    "path, method, payload",
    [("/v1/chat", "post", {"messages": [{"role": "user", "content": "q"}]}),
     ("/v1/embeddings", "post", {"texts": ["a"]}),
     ("/v1/status", "get", None)],
)
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "Basic test-token"}])
def test_secret_obligatoire(provider, path, method, payload, headers):
    client = make_client(provider)
    response = getattr(client, method)(path, json=payload, headers=headers) if payload else client.get(path, headers=headers)
    assert response.status_code == 401
    assert provider.requests == []


def test_sans_secret_configure_tout_est_refuse(provider):
    client = TestClient(create_app(load_settings({}), opener=provider))
    response = client.post("/v1/chat", json={"messages": []}, headers={"Authorization": "Bearer "})
    assert response.status_code == 503


def test_chat(provider):
    provider.reply("/chat/completions", CHOICE)
    response = make_client(provider).post(
        "/v1/chat", json={"messages": [{"role": "user", "content": "q"}], "tier": "fast"}, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {"model": "qwen3:8b", "message": {"role": "assistant", "content": "ok"},
                               "usage": {"total_tokens": 4}}


@pytest.mark.parametrize("env", [{}, {"AI_PROVIDER": "none"}])
def test_chat_indisponible_repond_503(provider, env):
    response = make_client(provider, **env).post(
        "/v1/chat", json={"messages": [{"role": "user", "content": "q"}]}, headers=AUTH)
    assert response.status_code == 503


def test_chat_outils_refuses_repond_422(provider):
    provider.reply("/chat/completions", http_error(400))
    response = make_client(provider).post(
        "/v1/chat", json={"messages": [{"role": "user", "content": "q"}],
                          "tools": [{"type": "function", "function": {"name": "t"}}]}, headers=AUTH)
    assert response.status_code == 422
    # Un code dans le corps : le 422 d'une requête invalide (FastAPI) ne doit pas passer pour un refus des outils.
    assert response.json() == {"detail": {"code": "tools_refused", "message": "AI provider refused the tools (HTTP 400)"}}


def test_embeddings(provider):
    provider.reply("/embeddings", {"data": [{"index": 0, "embedding": [0.5] * 1024}]})
    response = make_client(provider).post("/v1/embeddings", json={"texts": ["a"]}, headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert (body["model"], body["dimensions"], len(body["vectors"][0])) == ("bge-m3", 1024, 1024)


def test_embeddings_indisponibles_repondent_503(provider):
    response = make_client(provider).post("/v1/embeddings", json={"texts": ["a"]}, headers=AUTH)
    assert response.status_code == 503


@pytest.mark.parametrize(
    "env, models_reply, configured, chat_ok, embed_ok",
    [
        ({}, {"data": []}, True, True, True),
        ({}, None, True, False, False),
        ({"AI_PROVIDER": "none"}, {"data": []}, False, False, False),
    ],
)
def test_etat_du_fournisseur(provider, env, models_reply, configured, chat_ok, embed_ok):
    if models_reply is not None:
        provider.reply("/models", models_reply)
    body = make_client(provider, **env).get("/v1/status", headers=AUTH).json()
    assert body["configured"] is configured
    assert body["chat"]["available"] is chat_ok and body["embeddings"]["available"] is embed_ok
    assert body["chat"]["model_fast"] == "qwen3:8b" and body["embeddings"]["dimensions"] == 1024


def test_embeddings_sondes_a_part_quand_le_fournisseur_differe(provider):
    provider.reply("/models", lambda _: {"data": []})
    settings = load_settings({"GROQ_API_KEY": "gsk"})
    snapshot = ProviderStatus(settings, ProviderGateway(settings, provider)).snapshot()
    assert [r["url"] for r in provider.requests] == [
        "https://api.groq.com/openai/v1/models", "http://host.docker.internal:11434/v1/models"]
    assert snapshot["embeddings"]["available"] is True


def test_etat_mis_en_cache(provider):
    provider.reply("/models", {"data": []})
    now = [0.0]
    settings = load_settings({})
    status = ProviderStatus(settings, ProviderGateway(settings, provider), ttl_s=30, clock=lambda: now[0])
    status.snapshot()
    now[0] = 10.0
    status.snapshot()
    assert len(provider.requests) == 1
    now[0] = 31.0
    status.snapshot()
    assert len(provider.requests) == 2
