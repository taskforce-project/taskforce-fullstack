from __future__ import annotations

import hashlib
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


def _stable_vector(text: str, dimensions: int = 16) -> List[float]:
    # Deterministic placeholder vector for integration wiring.
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = []
    for i in range(dimensions):
        b = digest[i % len(digest)]
        values.append((b / 255.0) * 2.0 - 1.0)
    return values


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "taskforce-ai-service",
        "embedding_model": os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
    }


@app.post("/v1/embeddings", response_model=EmbedResponse)
def embeddings(payload: EmbedRequest) -> EmbedResponse:
    model = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    vectors = [_stable_vector(text) for text in payload.texts]
    return EmbedResponse(model=model, dimensions=16, vectors=vectors)
