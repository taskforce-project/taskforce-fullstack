"""Endpoint de santé / introspection (modèles configurés)."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "taskforce-ai-service",
        "embedding_model": settings.ollama_embed_model,
        "embedding_dim": settings.embedding_dim,
        "llm_model": settings.ollama_model,
        "ollama_base_url": settings.ollama_base_url,
    }
