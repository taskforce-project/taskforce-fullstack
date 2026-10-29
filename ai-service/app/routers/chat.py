"""Complétion (avec outils) déléguée au fournisseur configuré."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas import ChatRequest, ChatResponse
from app.security import require_token
from app.services.provider import ProviderError, ToolsRefusedError

router = APIRouter(prefix="/v1", tags=["chat"], dependencies=[Depends(require_token)])


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, request: Request) -> ChatResponse:
    gateway = request.app.state.gateway
    try:
        model, message, usage = gateway.chat(
            payload.messages,
            model=payload.model,
            tools=payload.tools,
            json_mode=payload.json_mode,
            temperature=payload.temperature,
            tier=payload.tier,
            think=payload.think,
        )
    except ToolsRefusedError as exc:  # le fournisseur répond, mais refuse les outils : l'agent ne peut pas agir
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ProviderError as exc:  # IA coupée ou fournisseur indisponible
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ChatResponse(model=model, message=message, usage=usage)
