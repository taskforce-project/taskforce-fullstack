"""Service d'embeddings : modèle sémantique (fastembed) avec **repli lexical déterministe**.

Le chargement du modèle est paresseux et mis en cache (singleton d'instance). Si `fastembed`/le
modèle n'est pas disponible (réseau, build), on bascule sur l'embedding lexical de
:mod:`app.core.vector_math` — la recherche reste fonctionnelle, sans qualité sémantique.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from app.config import Settings
from app.core.vector_math import lexical_embedding

logger = logging.getLogger("ai-service.embeddings")


class EmbeddingService:
    """Encapsule l'état du modèle d'embedding et l'algorithme de repli."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model = None
        self._model_failed = False

    @property
    def dim(self) -> int:
        return self._settings.embedding_dim

    @property
    def model_name(self) -> str:
        return self._settings.embedding_model

    def _load_model(self) -> Optional[object]:
        """Charge le modèle une seule fois ; mémorise l'échec pour ne pas réessayer à chaque appel."""
        if self._model is not None or self._model_failed:
            return self._model
        try:
            from fastembed import TextEmbedding  # import tardif : build léger si non utilisé

            logger.info("Chargement du modèle d'embedding %s…", self.model_name)
            self._model = TextEmbedding(model_name=self.model_name)
            logger.info("Modèle d'embedding prêt.")
        except Exception as exc:  # noqa: BLE001 — repli volontaire quelle que soit la cause
            self._model_failed = True
            logger.warning("Embeddings réels indisponibles (%s) — repli déterministe.", exc)
        return self._model

    def embed(self, texts: List[str]) -> tuple[List[List[float]], bool]:
        """Retourne ``(vecteurs, real)`` — ``real=False`` si le repli lexical a été utilisé."""
        model = self._load_model()
        if model is not None:
            try:
                return [list(map(float, vector)) for vector in model.embed(texts)], True
            except Exception as exc:  # noqa: BLE001
                logger.warning("Échec d'embedding réel (%s) — repli.", exc)
        return [lexical_embedding(text, self.dim) for text in texts], False
