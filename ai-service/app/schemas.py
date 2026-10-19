"""Contrats HTTP entre le backend et le service."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    messages: List[dict]                  # [{role, content}] ou messages d'outils (format OpenAI)
    model: Optional[str] = None           # surcharge explicite ; sinon le modèle du tier
    tier: Optional[str] = None            # "fast" | "standard" | "deep", prioritaire sur model
    think: bool = False                   # raisonnement Qwen3 (sans tier)
    tools: Optional[List[dict]] = None    # outils (format OpenAI)
    json_mode: bool = False               # force une sortie JSON valide
    temperature: float = 0.4


class ChatResponse(BaseModel):
    model: str
    message: dict                         # message assistant (peut porter des `tool_calls`)
    usage: dict = Field(default_factory=dict)  # {prompt_tokens, completion_tokens, total_tokens}


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    vectors: List[List[float]]
