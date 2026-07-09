"""Service d'embeddings : modèle sémantique local (**BGE-M3 via Ollama**) avec **repli lexical**.

Priorité au vrai sémantique (Ollama `bge-m3`, 1024d). Si Ollama est indisponible, on bascule sur
l'embedding lexical déterministe de :mod:`app.core.vector_math` (même dimension) — la recherche reste
fonctionnelle, sans qualité sémantique.
"""
from __future__ import annotations

import logging
from typing import List

from app.config import Settings
from app.core.vector_math import lexical_embedding
from app.services.ollama_gateway import OllamaGateway, OllamaGatewayError

logger = logging.getLogger("ai-service.embeddings")


class EmbeddingService:
    """Orchestration : embeddings sémantiques (Ollama) → repli lexical déterministe."""

    def __init__(self, settings: Settings, gateway: OllamaGateway) -> None:
        self._settings = settings
        self._gateway = gateway

    @property
    def dim(self) -> int:
        return self._settings.embedding_dim

    @property
    def model_name(self) -> str:
        return self._settings.ollama_embed_model

    def embed(self, texts: List[str]) -> tuple[List[List[float]], bool]:
        """Retourne ``(vecteurs, real)`` — ``real=False`` si le repli lexical a été utilisé."""
        if texts:
            try:
                return self._gateway.embed(texts), True
            except OllamaGatewayError as exc:
                logger.warning("Embeddings sémantiques indisponibles (%s) — repli lexical.", exc)
        return [lexical_embedding(text, self.dim) for text in texts], False
