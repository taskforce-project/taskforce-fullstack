"""Configuration centralisée du service, lue depuis l'environnement au démarrage.

Volontairement sans dépendance externe (`pydantic-settings` indisponible ici : réseau qui
corrompt les gros téléchargements pip). Un simple modèle Pydantic + `os.getenv` suffit et reste
typé/validé.
"""
from __future__ import annotations

import os

from pydantic import BaseModel


class Settings(BaseModel):
    """Paramètres du service (immuables après démarrage)."""

    # --- Embeddings (BGE-M3 via Ollama, 1024d) ---
    # Dimension de l'espace vectoriel. DOIT rester alignée avec la colonne pgvector
    # `knowledge_nodes.embedding vector(N)` côté backend (migration V59 = 1024).
    embedding_dim: int = 1024
    ollama_embed_model: str = os.getenv("OLLAMA_EMBED_MODEL", "bge-m3")

    # --- AI Gateway → LLM local (Ollama, API OpenAI-compatible) ---
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen3:14b")            # tier standard/deep
    ollama_model_fast: str = os.getenv("OLLAMA_MODEL_FAST", "qwen2.5:7b-instruct")   # tier "fast" (scoring/petites actions) — instruct pur, pas de raisonnement → bien plus rapide que qwen3
    ollama_timeout_s: float = float(os.getenv("OLLAMA_TIMEOUT", "180"))  # génération locale = lente

    # --- Provider CHAT alternatif : Groq (API OpenAI-compatible, HÉBERGÉE) ---
    # Si GROQ_API_KEY est défini, le CHAT (smart-assign, Cortex, orchestration/agents) bascule sur Groq
    # → aucun compute local requis, donc déployable sur une petite VM (ex. 4 Go RAM) sans charger de modèle.
    # Sinon → Ollama local (défaut, dev). La bascule est AUTOMATIQUE (détection de la clé), rien d'autre à changer.
    # IMPORTANT : les EMBEDDINGS (brain / pgvector, bge-m3) restent TOUJOURS sur Ollama — Groq n'expose pas
    # d'API d'embeddings. Sur une VM sans Ollama, les features « chat » marchent (Groq), le knowledge-graph non.
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_base_url: str = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")        # tier standard/deep (hébergé)
    groq_model_fast: str = os.getenv("GROQ_MODEL_FAST", "llama-3.1-8b-instant") # tier "fast" (hébergé, très rapide)

    model_config = {"frozen": True}

    @property
    def use_groq(self) -> bool:
        """Vrai si une clé Groq est fournie → le chat passe par Groq plutôt que par Ollama local."""
        return bool(self.groq_api_key.strip())


settings = Settings()
