"""Endpoint d'embeddings (sémantique si disponible, sinon repli lexical déterministe)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_embedding_service
from app.schemas import EmbedRequest, EmbedResponse
from app.services.embedding_service import EmbeddingService

router = APIRouter(prefix="/v1", tags=["embeddings"])


@router.post("/embeddings", response_model=EmbedResponse)
def embeddings(
    payload: EmbedRequest,
    service: EmbeddingService = Depends(get_embedding_service),
) -> EmbedResponse:
    vectors, real = service.embed(payload.texts)
    return EmbedResponse(
        model=service.model_name if real else f"lexical-hashing-{service.dim}",
        dimensions=service.dim,
        vectors=vectors,
        real=real,
    )
