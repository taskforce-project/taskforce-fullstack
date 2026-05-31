from __future__ import annotations

import hashlib
import math
import os
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="taskforce-ai-service", version="0.1.0")


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    vectors: List[List[float]]


class CandidateText(BaseModel):
    candidate_id: int
    text: str


class SemanticScoreRequest(BaseModel):
    issue_text: str
    candidates: List[CandidateText] = Field(default_factory=list)


class CandidateScore(BaseModel):
    candidate_id: int
    score: float


class SemanticScoreResponse(BaseModel):
    scores: List[CandidateScore]


class CandidateFeature(BaseModel):
    candidate_id: int
    features: dict = Field(default_factory=dict)


class HistoryRankRequest(BaseModel):
    candidates: List[CandidateFeature] = Field(default_factory=list)


class HistoryRankResponse(BaseModel):
    scores: List[CandidateScore]


def _stable_vector(text: str, dimensions: int = 16) -> List[float]:
    # Deterministic placeholder vector for integration wiring.
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = []
    for i in range(dimensions):
        b = digest[i % len(digest)]
        values.append((b / 255.0) * 2.0 - 1.0)
    return values


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a <= 1e-12 or norm_b <= 1e-12:
        return 0.0
    sim = dot / (norm_a * norm_b)
    return max(-1.0, min(1.0, sim))


def _normalize_score(value: float) -> float:
    return max(0.0, min(1.0, value))


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "taskforce-ai-service",
        "embedding_model": os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
    }


@app.post("/v1/embeddings")
def embeddings(payload: EmbedRequest) -> EmbedResponse:
    model = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    vectors = [_stable_vector(text) for text in payload.texts]
    return EmbedResponse(model=model, dimensions=16, vectors=vectors)


@app.post("/v1/smart-assign/semantic-score")
def smart_assign_semantic_score(payload: SemanticScoreRequest) -> SemanticScoreResponse:
    issue_vector = _stable_vector(payload.issue_text)
    scores: List[CandidateScore] = []
    for candidate in payload.candidates:
        candidate_vector = _stable_vector(candidate.text)
        cosine = _cosine_similarity(issue_vector, candidate_vector)
        normalized = _normalize_score((cosine + 1.0) / 2.0)
        scores.append(CandidateScore(candidate_id=candidate.candidate_id, score=normalized))
    return SemanticScoreResponse(scores=scores)


@app.post("/v1/smart-assign/history-rank")
def smart_assign_history_rank(payload: HistoryRankRequest) -> HistoryRankResponse:
    scores: List[CandidateScore] = []
    for candidate in payload.candidates:
        f = candidate.features
        past_assignments = float(f.get("past_assignments", 0.0))
        accepted_rate = float(f.get("accepted_rate", 0.0))
        resolved_rate = float(f.get("resolved_rate", 0.0))
        workload_score = float(f.get("workload_score", 0.0)) / 100.0
        availability = float(f.get("availability", 0.0)) / 100.0
        label_match_score = float(f.get("label_match_score", 0.0)) / 100.0

        experience = min(1.0, past_assignments / 20.0)
        score = (
            accepted_rate * 0.25
            + resolved_rate * 0.3
            + experience * 0.15
            + workload_score * 0.15
            + availability * 0.1
            + label_match_score * 0.05
        )
        scores.append(CandidateScore(candidate_id=candidate.candidate_id, score=_normalize_score(score)))

    return HistoryRankResponse(scores=scores)
