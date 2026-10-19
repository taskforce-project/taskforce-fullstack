import pytest

from app.config import load_settings


@pytest.mark.parametrize(
    "env, chat_base, model, model_fast, embed_base",
    [
        # Rien de posé : Ollama sur la machine hôte, un seul modèle pour les deux tiers, embeddings au même endroit.
        ({}, "http://host.docker.internal:11434/v1", "qwen3:8b", "qwen3:8b", "http://host.docker.internal:11434/v1"),
        # Alias OLLAMA_* d'une instance existante.
        ({"OLLAMA_BASE_URL": "http://gpu:11434/", "OLLAMA_MODEL": "qwen3:14b", "OLLAMA_MODEL_FAST": "qwen3:8b"},
         "http://gpu:11434/v1", "qwen3:14b", "qwen3:8b", "http://gpu:11434/v1"),
        # Alias GROQ_* : le chat part chez Groq, les embeddings restent sur Ollama (Groq n'en propose pas).
        ({"GROQ_API_KEY": "gsk"}, "https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "openai/gpt-oss-20b",
         "http://host.docker.internal:11434/v1"),
        # Format générique : tout fournisseur compatible OpenAI, embeddings au même endroit par défaut.
        ({"AI_BASE_URL": "https://openrouter.ai/api/v1/", "AI_MODEL": "m", "GROQ_API_KEY": "ignored"},
         "https://openrouter.ai/api/v1", "m", "m", "https://openrouter.ai/api/v1"),
        # Embeddings ailleurs que le chat.
        ({"AI_BASE_URL": "https://api.groq.com/openai/v1", "AI_EMBED_BASE_URL": "http://ollama:11434/v1"},
         "https://api.groq.com/openai/v1", "qwen3:8b", "qwen3:8b", "http://ollama:11434/v1"),
    ],
)
def test_resolution_des_fournisseurs(env, chat_base, model, model_fast, embed_base):
    s = load_settings(env)
    assert (s.chat_base_url, s.model, s.model_fast, s.embed_base_url) == (chat_base, model, model_fast, embed_base)
    assert s.enabled


@pytest.mark.parametrize(
    "env, chat_key, embed_key",
    [
        ({"GROQ_API_KEY": "gsk"}, "gsk", ""),
        ({"AI_BASE_URL": "https://x/v1", "AI_API_KEY": "k"}, "k", "k"),
        ({"AI_BASE_URL": "https://x/v1", "AI_API_KEY": "k", "AI_EMBED_BASE_URL": "https://y/v1"}, "k", ""),
        ({"AI_BASE_URL": "https://x/v1", "AI_API_KEY": "k", "AI_EMBED_API_KEY": "e"}, "k", "e"),
    ],
)
def test_cles_par_fournisseur(env, chat_key, embed_key):
    s = load_settings(env)
    assert (s.chat_api_key, s.embed_api_key) == (chat_key, embed_key)


@pytest.mark.parametrize(
    "env, enabled, timeout, embed_model",
    [
        ({}, True, 120.0, "bge-m3"),
        ({"AI_PROVIDER": "none"}, False, 120.0, "bge-m3"),
        ({"AI_PROVIDER": "None", "OLLAMA_TIMEOUT": "300"}, False, 300.0, "bge-m3"),
        ({"AI_TIMEOUT": "60", "OLLAMA_EMBED_MODEL": "mxbai-embed-large"}, True, 60.0, "mxbai-embed-large"),
    ],
)
def test_coupure_delai_et_modele_d_embedding(env, enabled, timeout, embed_model):
    s = load_settings(env)
    assert (s.enabled, s.timeout_s, s.embed_model) == (enabled, timeout, embed_model)


def test_les_valeurs_vides_comptent_comme_absentes():
    s = load_settings({"AI_BASE_URL": "  ", "GROQ_API_KEY": "", "OLLAMA_MODEL": ""})
    assert s.chat_base_url == "http://host.docker.internal:11434/v1"
    assert s.model == "qwen3:8b"
