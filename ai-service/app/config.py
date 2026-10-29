"""Configuration du service, lue depuis l'environnement au démarrage.

Un seul format pour tout fournisseur compatible OpenAI (Ollama, LM Studio, vLLM, OpenRouter, Groq, OpenAI) :

- chat : ``AI_BASE_URL`` (avec ``/v1``), ``AI_API_KEY``, ``AI_MODEL``, ``AI_MODEL_FAST`` ;
- embeddings : ``AI_EMBED_BASE_URL``, ``AI_EMBED_API_KEY``, ``AI_EMBED_MODEL`` (même fournisseur que le chat par
  défaut) ;
- ``AI_TIMEOUT`` (secondes), ``AI_PROVIDER=none`` pour couper l'IA, ``AI_SERVICE_TOKEN`` (secret partagé avec le
  backend, obligatoire).

Les anciennes variables restent lues comme alias, pour qu'une instance existante démarre sans changement :
``GROQ_*`` (fournisseur hébergé, choisi quand ``GROQ_API_KEY`` est posée) et ``OLLAMA_*`` (Ollama local, le défaut).
Sans rien de posé, le service vise Ollama sur la machine hôte : qwen3:8b (gère les outils) pour les deux tiers,
le tier rapide coupant seulement le raisonnement, et bge-m3 pour les embeddings.

Volontairement sans ``pydantic-settings`` : un modèle Pydantic figé et ``os.getenv`` suffisent.
"""
from __future__ import annotations

import os
from typing import Mapping, Optional

from pydantic import BaseModel

# Dimension des vecteurs : DOIT rester celle de la colonne pgvector `knowledge_nodes.embedding vector(1024)` (V59).
EMBEDDING_DIM = 1024

DEFAULT_OLLAMA_URL = "http://host.docker.internal:11434"
DEFAULT_GROQ_URL = "https://api.groq.com/openai/v1"


class Settings(BaseModel):
    """Paramètres du service (immuables après démarrage). Les URL de base incluent ``/v1``."""

    enabled: bool
    chat_provider: str = "custom"         # "ollama", "groq" ou "custom" (toute autre API compatible OpenAI)
    chat_base_url: str
    chat_api_key: str
    model: str
    model_fast: str
    embed_base_url: str
    embed_api_key: str
    embed_model: str
    embedding_dim: int = EMBEDDING_DIM
    timeout_s: float
    service_token: str

    model_config = {"frozen": True}


def _first(env: Mapping[str, str], *names: str, default: str = "") -> str:
    """Première variable non vide parmi ``names`` (ordre de priorité), sinon ``default``."""
    for name in names:
        value = env.get(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def load_settings(env: Optional[Mapping[str, str]] = None) -> Settings:
    """Résout la configuration. ``env`` sert aux tests ; par défaut, l'environnement du processus."""
    env = os.environ if env is None else env
    ollama_v1 = _first(env, "OLLAMA_BASE_URL", default=DEFAULT_OLLAMA_URL).rstrip("/") + "/v1"
    explicit = _first(env, "AI_BASE_URL")
    groq_key = _first(env, "GROQ_API_KEY")

    if explicit:
        provider = "custom"
        chat_base = explicit
        chat_key = _first(env, "AI_API_KEY")
        model = _first(env, "AI_MODEL", default="qwen3:8b")
        model_fast = _first(env, "AI_MODEL_FAST", default=model)
    elif groq_key:
        # Alias historique : la clé Groq bascule le chat sur Groq (instance publique d'avant le lot 4).
        provider = "groq"
        chat_base = _first(env, "GROQ_BASE_URL", default=DEFAULT_GROQ_URL)
        chat_key = _first(env, "AI_API_KEY", "GROQ_API_KEY")
        model = _first(env, "AI_MODEL", "GROQ_MODEL", default="openai/gpt-oss-120b")
        model_fast = _first(env, "AI_MODEL_FAST", "GROQ_MODEL_FAST", default="openai/gpt-oss-20b")
    else:
        provider = "ollama"
        chat_base = ollama_v1
        chat_key = _first(env, "AI_API_KEY")
        model = _first(env, "AI_MODEL", "OLLAMA_MODEL", default="qwen3:8b")
        model_fast = _first(env, "AI_MODEL_FAST", "OLLAMA_MODEL_FAST", default=model)

    # Embeddings : même fournisseur que le chat quand il est explicite ; sinon Ollama (Groq n'en propose pas).
    if _first(env, "AI_EMBED_BASE_URL"):
        embed_base = _first(env, "AI_EMBED_BASE_URL")
        embed_key = _first(env, "AI_EMBED_API_KEY")
    elif explicit:
        embed_base = explicit
        embed_key = _first(env, "AI_EMBED_API_KEY", "AI_API_KEY")
    else:
        embed_base = ollama_v1
        embed_key = _first(env, "AI_EMBED_API_KEY")

    return Settings(
        enabled=_first(env, "AI_PROVIDER").lower() != "none",
        chat_provider=provider,
        chat_base_url=chat_base.rstrip("/"),
        chat_api_key=chat_key,
        model=model,
        model_fast=model_fast,
        embed_base_url=embed_base.rstrip("/"),
        embed_api_key=embed_key,
        embed_model=_first(env, "AI_EMBED_MODEL", "OLLAMA_EMBED_MODEL", default="bge-m3"),
        timeout_s=float(_first(env, "AI_TIMEOUT", "OLLAMA_TIMEOUT", default="120")),
        service_token=_first(env, "AI_SERVICE_TOKEN"),
    )


settings = load_settings()
