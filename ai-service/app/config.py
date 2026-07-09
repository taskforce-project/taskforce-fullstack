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
    ollama_model_fast: str = os.getenv("OLLAMA_MODEL_FAST", "qwen3:8b")   # tier "fast" (petites actions)
    ollama_timeout_s: float = float(os.getenv("OLLAMA_TIMEOUT", "180"))  # génération locale = lente

    model_config = {"frozen": True}


settings = Settings()
