"""AI Gateway — génération / tool-calling déléguée au LLM local (Ollama)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_ollama_gateway
from app.schemas import ChatRequest, ChatResponse
from app.services.ollama_gateway import OllamaGateway, OllamaGatewayError

router = APIRouter(prefix="/v1", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    gateway: OllamaGateway = Depends(get_ollama_gateway),
) -> ChatResponse:
    try:
        model, message = gateway.chat(
            payload.messages,
            model=payload.model,
            tools=payload.tools,
            json_mode=payload.json_mode,
            temperature=payload.temperature,
        )
    except OllamaGatewayError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ChatResponse(model=model, message=message)
