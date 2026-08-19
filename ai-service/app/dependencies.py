"""Câblage des dépendances (singletons) exposées aux routers via ``fastapi.Depends``.

Centraliser ici facilite les tests (override des providers) et garde les routers découplés
de la construction des services.
"""
from __future__ import annotations

from app.config import settings
from app.services.embedding_service import EmbeddingService
from app.services.ollama_gateway import OllamaGateway
from app.services.smart_assign_service import SmartAssignService

_ollama_gateway = OllamaGateway(settings)
_embedding_service = EmbeddingService(settings, _ollama_gateway)
_smart_assign_service = SmartAssignService()


def get_embedding_service() -> EmbeddingService:
    return _embedding_service


def get_ollama_gateway() -> OllamaGateway:
    return _ollama_gateway


def get_smart_assign_service() -> SmartAssignService:
    return _smart_assign_service
