import pytest

from app.config import load_settings
from app.services.provider import (NotConfiguredError, ProviderError, ProviderGateway, ToolsRefusedError,
                                   strip_thinking, with_no_think)
from tests.conftest import http_error

CHOICE = {"choices": [{"message": {"role": "assistant", "content": "ok"}}],
          "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4}}


@pytest.mark.parametrize(
    "model, think, expected",
    [
        ("qwen3:4b", False, "hi /no_think"),
        ("qwen/qwen3-32b", False, "hi /no_think"),
        ("qwen3:8b", True, "hi"),
        ("llama3.2:3b", False, "hi"),
        ("openai/gpt-oss-20b", False, "hi"),
        ("qwen2.5:7b-instruct", False, "hi"),
    ],
)
def test_no_think_reserve_a_qwen3(model, think, expected):
    messages = [{"role": "system", "content": "s"}, {"role": "user", "content": "hi"}]
    out = with_no_think(messages, model, think)
    assert out[-1]["content"] == expected
    assert messages[-1]["content"] == "hi"  # la liste de l'appelant n'est pas modifiée


@pytest.mark.parametrize(
    "content, expected",
    [
        ("<think>raisonnement</think>\n{\"a\": 1}", "{\"a\": 1}"),
        ("réponse", "réponse"),
        (None, None),
    ],
)
def test_bloc_de_raisonnement_retire(content, expected):
    assert strip_thinking({"content": content})["content"] == expected


@pytest.mark.parametrize(
    "tier, model, no_think",
    [("fast", "qwen3:4b", True), ("standard", "qwen3:8b", True), ("deep", "qwen3:8b", False), (None, "qwen3:8b", True)],
)
def test_tier_choisit_le_modele(provider, tier, model, no_think):
    provider.reply("/chat/completions", CHOICE)
    gateway = ProviderGateway(load_settings({"AI_MODEL_FAST": "qwen3:4b"}), provider)
    used, message, usage = gateway.chat([{"role": "user", "content": "q"}], tier=tier)
    sent = provider.requests[0]["body"]
    assert used == model and sent["model"] == model
    assert sent["messages"][-1]["content"].endswith("/no_think") is no_think
    assert message["content"] == "ok" and usage["total_tokens"] == 4


def test_cle_et_user_agent_envoyes(provider):
    provider.reply("/chat/completions", CHOICE)
    gateway = ProviderGateway(load_settings({"GROQ_API_KEY": "gsk"}), provider)
    gateway.chat([{"role": "user", "content": "q"}], tier="fast", json_mode=True)
    request = provider.requests[0]
    assert request["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer gsk"
    assert request["headers"]["User-agent"] == "TaskForce-AI/1.0"
    assert request["body"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize("code", [400, 413])
def test_trop_d_outils_reessaye_avec_moins(provider, code):
    provider.reply("/chat/completions", http_error(code), http_error(code), CHOICE)
    gateway = ProviderGateway(load_settings({}), provider)
    tools = [{"type": "function", "function": {"name": f"t{i}"}} for i in range(8)]
    gateway.chat([{"role": "user", "content": "q"}], tools=tools)
    assert [len(r["body"].get("tools", [])) for r in provider.requests] == [8, 4, 2]


def test_outils_refuses_jusqu_au_dernier(provider):
    provider.reply("/chat/completions", http_error(400))
    gateway = ProviderGateway(load_settings({}), provider)
    tools = [{"type": "function", "function": {"name": f"t{i}"}} for i in range(8)]
    with pytest.raises(ToolsRefusedError):
        gateway.chat([{"role": "user", "content": "q"}], tools=tools)
    # Jamais de requête sans outils : le modèle y annonçait des actions qu'il n'avait pas faites (recette du 29/10).
    assert [len(r["body"].get("tools", [])) for r in provider.requests] == [8, 4, 2, 1]


def test_trop_gros_meme_avec_un_outil_n_est_pas_un_refus_des_outils(provider):
    # Un 413 qui tient avec un seul outil vient de la conversation : ce n'est pas aux outils qu'on le reproche.
    provider.reply("/chat/completions", http_error(413))
    gateway = ProviderGateway(load_settings({}), provider)
    tools = [{"type": "function", "function": {"name": f"t{i}"}} for i in range(4)]
    with pytest.raises(ProviderError) as raised:
        gateway.chat([{"role": "user", "content": "q"}], tools=tools)
    assert not isinstance(raised.value, ToolsRefusedError)
    assert "too large" in str(raised.value)


FAILED_CALL = b'{"error":{"message":"Tool call validation failed","type":"invalid_request_error","code":"tool_use_failed"}}'


def test_appel_d_outil_mal_forme_redemande_avec_les_memes_outils(provider):
    provider.reply("/chat/completions", http_error(400, FAILED_CALL), CHOICE)
    gateway = ProviderGateway(load_settings({"GROQ_API_KEY": "gsk"}), provider)
    tools = [{"type": "function", "function": {"name": f"t{i}"}} for i in range(7)]
    gateway.chat([{"role": "user", "content": "q"}], tools=tools)
    # Un tirage raté se redemande tel quel : retirer des outils ôtait justement celui qu'il fallait (29/10/2026).
    assert [len(r["body"].get("tools", [])) for r in provider.requests] == [7, 7]


def test_appel_d_outil_mal_forme_deux_fois_puis_moins_d_outils(provider):
    provider.reply("/chat/completions", http_error(400, FAILED_CALL), http_error(400, FAILED_CALL), CHOICE)
    gateway = ProviderGateway(load_settings({"GROQ_API_KEY": "gsk"}), provider)
    tools = [{"type": "function", "function": {"name": f"t{i}"}} for i in range(7)]
    gateway.chat([{"role": "user", "content": "q"}], tools=tools)
    assert [len(r["body"].get("tools", [])) for r in provider.requests] == [7, 7, 3]


@pytest.mark.parametrize(
    "env, tier, model, effort",
    [
        ({}, "fast", "qwen3:8b", "none"),                                          # Ollama, sans raisonnement
        ({}, "deep", "qwen3:8b", None),                                            # raisonnement voulu
        ({"OLLAMA_MODEL": "llama3.1:8b"}, "fast", "llama3.1:8b", None),            # pas un Qwen3
        ({"GROQ_API_KEY": "gsk", "GROQ_MODEL_FAST": "qwen/qwen3-32b"}, "fast", "qwen/qwen3-32b", None),
        ({"AI_BASE_URL": "https://api.example.com/v1"}, "fast", "qwen3:8b", None),  # réglage inconnu ailleurs
    ],
)
def test_raisonnement_coupe_par_le_reglage_d_ollama(provider, env, tier, model, effort):
    provider.reply("/chat/completions", CHOICE)
    used, _, _ = ProviderGateway(load_settings(env), provider).chat([{"role": "user", "content": "q"}], tier=tier)
    assert used == model
    assert provider.requests[0]["body"].get("reasoning_effort") == effort


@pytest.mark.parametrize("error", [http_error(500), http_error(401)])
def test_refus_du_fournisseur(provider, error):
    provider.reply("/chat/completions", error)
    with pytest.raises(ProviderError):
        ProviderGateway(load_settings({}), provider).chat([{"role": "user", "content": "q"}])


def test_fournisseur_injoignable(provider):
    with pytest.raises(ProviderError):
        ProviderGateway(load_settings({}), provider).chat([{"role": "user", "content": "q"}])


def test_ia_coupee(provider):
    gateway = ProviderGateway(load_settings({"AI_PROVIDER": "none"}), provider)
    with pytest.raises(NotConfiguredError):
        gateway.chat([{"role": "user", "content": "q"}])
    with pytest.raises(NotConfiguredError):
        gateway.embed(["x"])
    assert provider.requests == []


def test_embeddings_dans_l_ordre(provider):
    provider.reply("/embeddings", {"data": [{"index": 1, "embedding": [2.0] * 1024},
                                            {"index": 0, "embedding": [1.0] * 1024}]})
    vectors = ProviderGateway(load_settings({}), provider).embed(["a", "b"])
    assert [v[0] for v in vectors] == [1.0, 2.0]
    assert provider.requests[0]["body"] == {"model": "bge-m3", "input": ["a", "b"]}


@pytest.mark.parametrize(
    "payload",
    [
        {"data": [{"index": 0, "embedding": [0.1] * 768}]},  # mauvaise dimension
        {"data": []},                                         # nombre de vecteurs incorrect
        {"error": "model not found"},                         # réponse invalide
    ],
)
def test_embeddings_invalides(provider, payload):
    provider.reply("/embeddings", payload)
    with pytest.raises(ProviderError):
        ProviderGateway(load_settings({}), provider).embed(["a"])


def test_embeddings_sans_texte(provider):
    assert ProviderGateway(load_settings({}), provider).embed([]) == []
    assert provider.requests == []
