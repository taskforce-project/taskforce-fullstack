"""Vivacité (sonde Docker, sans secret) et état du fournisseur (pour le backend, avec secret)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app import __version__
from app.security import require_token

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Le processus répond. Ne dit rien du fournisseur et n'expose aucune configuration."""
    return {"status": "ok", "service": "taskforce-ai-service", "version": __version__}


@router.get("/v1/status", dependencies=[Depends(require_token)])
def status(request: Request) -> dict:
    """IA configurée ou non, modèles, fournisseur joignable ou non (mis en cache 30 s)."""
    return request.app.state.status.snapshot()
