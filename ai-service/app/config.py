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

    # --- Embeddings ---
    # Dimension de l'espace vectoriel. DOIT rester alignée avec la colonne pgvector
    # `knowledge_nodes.embedding vector(N)` côté backend (migration Flyway).
    embedding_dim: int = 384
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

    # --- AI Gateway → LLM local (Ollama, API OpenAI-compatible) ---
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen2.5:14b-instruct")
    ollama_timeout_s: float = float(os.getenv("OLLAMA_TIMEOUT", "180"))  # génération locale = lente

    model_config = {"frozen": True}


settings = Settings()
