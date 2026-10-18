"""État du fournisseur (configuré, joignable), mis en cache quelques secondes.

Le backend s'en sert pour échouer tout de suite quand l'IA n'est pas disponible, au lieu d'attendre le délai
d'expiration à chaque appel, et pour afficher « IA non configurée » dans l'interface.
"""
from __future__ import annotations

import threading
import time
from typing import Callable, Optional

from app.config import Settings
from app.services.provider import ProviderGateway


class ProviderStatus:
    def __init__(self, settings: Settings, gateway: ProviderGateway, ttl_s: float = 30.0,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._settings = settings
        self._gateway = gateway
        self._ttl_s = ttl_s
        self._clock = clock
        self._lock = threading.Lock()
        self._cached: Optional[dict] = None
        self._cached_at = 0.0

    def snapshot(self) -> dict:
        with self._lock:
            now = self._clock()
            if self._cached is not None and now - self._cached_at < self._ttl_s:
                return self._cached
            self._cached = self._compute()
            self._cached_at = now
            return self._cached

    def _compute(self) -> dict:
        s = self._settings
        chat_ok = embed_ok = False
        if s.enabled:
            chat_ok = self._gateway.probe(s.chat_base_url, s.chat_api_key)
            same_endpoint = (s.embed_base_url, s.embed_api_key) == (s.chat_base_url, s.chat_api_key)
            embed_ok = chat_ok if same_endpoint else self._gateway.probe(s.embed_base_url, s.embed_api_key)
        return {
            "configured": s.enabled,
            "chat": {"model": s.model, "model_fast": s.model_fast, "available": chat_ok},
            "embeddings": {"model": s.embed_model, "dimensions": s.embedding_dim, "available": embed_ok},
        }
