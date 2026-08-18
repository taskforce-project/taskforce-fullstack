"""Endpoint de santé / introspection (modèles configurés)."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    use_groq = settings.use_groq
    return {
        "status": "ok",
        "service": "taskforce-ai-service",
        # Chat : Groq (hébergé) si clé fournie, sinon Ollama local. Embeddings : toujours Ollama.
        "chat_provider": "groq" if use_groq else "ollama",
        "llm_model": settings.groq_model if use_groq else settings.ollama_model,
        "llm_model_fast": settings.groq_model_fast if use_groq else settings.ollama_model_fast,
        "chat_base_url": settings.groq_base_url if use_groq else settings.ollama_base_url,
        "embedding_provider": "ollama",
        "embedding_model": settings.ollama_embed_model,
        "embedding_dim": settings.embedding_dim,
        "ollama_base_url": settings.ollama_base_url,
    }
