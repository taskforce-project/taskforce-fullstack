"""Embeddings du modèle configuré. Pas de repli : sans modèle, le backend passe à la recherche plein texte.

Le service renvoyait autrefois des vecteurs « lexicaux » (hachage de mots) quand le modèle manquait. Rangés dans
la même colonne que les vrais, ils rendaient les similarités incomparables : ils ont été retirés.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas import EmbedRequest, EmbedResponse
from app.security import require_token
from app.services.provider import ProviderError

router = APIRouter(prefix="/v1", tags=["embeddings"], dependencies=[Depends(require_token)])


@router.post("/embeddings", response_model=EmbedResponse)
def embeddings(payload: EmbedRequest, request: Request) -> EmbedResponse:
    settings = request.app.state.settings
    try:
        vectors = request.app.state.gateway.embed(payload.texts)
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return EmbedResponse(model=settings.embed_model, dimensions=settings.embedding_dim, vectors=vectors)
