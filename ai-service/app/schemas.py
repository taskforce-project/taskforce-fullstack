"""DTOs Pydantic (contrats HTTP). Aucun changement de forme vs l'API existante."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# --- Embeddings -------------------------------------------------------------

class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    vectors: List[List[float]]
    real: bool = True  # False = repli lexical déterministe (pas de qualité sémantique)


# --- Chat (AI Gateway → LLM) ------------------------------------------------

class ChatRequest(BaseModel):
    messages: List[dict]                  # [{role, content}] ou messages d'outils (format OpenAI)
    model: Optional[str] = None           # défaut = settings.ollama_model
    tier: Optional[str] = None            # "fast" | "standard" | "deep" — routing modèle (prioritaire sur model)
    think: bool = False                   # forcer le raisonnement Qwen3 ; sinon /no_think (plus rapide)
    tools: Optional[List[dict]] = None    # tool-calling (format OpenAI)
    json_mode: bool = False               # force une sortie JSON valide
    temperature: float = 0.4


class ChatResponse(BaseModel):
    model: str
    message: dict                         # message assistant (peut contenir `tool_calls`)


# --- Smart Assign -----------------------------------------------------------

class CandidateText(BaseModel):
    candidate_id: int
    text: str


class SemanticScoreRequest(BaseModel):
    issue_text: str
    candidates: List[CandidateText] = Field(default_factory=list)


class CandidateFeature(BaseModel):
    candidate_id: int
    features: dict = Field(default_factory=dict)


class HistoryRankRequest(BaseModel):
    candidates: List[CandidateFeature] = Field(default_factory=list)


class CandidateScore(BaseModel):
    candidate_id: int
    score: float


class ScoreResponse(BaseModel):
    scores: List[CandidateScore]
