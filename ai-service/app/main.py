from __future__ import annotations

import hashlib
import logging
import math
import os
import re
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="taskforce-ai-service", version="0.2.0")

logger = logging.getLogger("ai-service")

# Dimension de l'espace d'embedding (all-MiniLM-L6-v2 = 384). Doit rester aligné
# avec la colonne pgvector `knowledge_nodes.embedding vector(384)` (migration V52).
EMBEDDING_DIM = 384
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# Chargement paresseux + singleton du modèle. Si fastembed/le modèle n'est pas
# disponible (réseau, build), on bascule sur un vecteur déterministe de repli :
# la recherche reste fonctionnelle (plomberie OK), juste sans qualité sémantique.
_model = None
_model_failed = False


def _get_model():
    global _model, _model_failed
    if _model is not None or _model_failed:
        return _model
    try:
        from fastembed import TextEmbedding  # import tardif (build léger si non utilisé)
        logger.info("Chargement du modèle d'embedding %s…", EMBEDDING_MODEL_NAME)
        _model = TextEmbedding(model_name=EMBEDDING_MODEL_NAME)
        logger.info("Modèle d'embedding prêt.")
    except Exception as exc:  # noqa: BLE001
        _model_failed = True
        logger.warning("Embeddings réels indisponibles (%s) — repli déterministe.", exc)
    return _model


def _embed_texts(texts: List[str]) -> tuple[List[List[float]], bool]:
    """Retourne (vecteurs 384d, real?) ; real=False si repli déterministe utilisé."""
    model = _get_model()
    if model is not None:
        try:
            vectors = [list(map(float, v)) for v in model.embed(texts)]
            return vectors, True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Échec d'embedding réel (%s) — repli.", exc)
    return [_lexical_embedding(t, EMBEDDING_DIM) for t in texts], False


_TOKEN_RE = re.compile(r"[a-z0-9]{2,}")


def _hash_bucket(token: str, dim: int) -> tuple[int, float]:
    """Bucket + signe par feature hashing signé (réduit le biais de collision)."""
    h = hashlib.md5(token.encode("utf-8")).digest()
    bucket = int.from_bytes(h[:4], "big") % dim
    sign = 1.0 if (h[4] & 1) == 0 else -1.0
    return bucket, sign


def _lexical_embedding(text: str, dim: int) -> List[float]:
    """Embedding lexical offline (sans dépendance) : feature hashing de tokens + trigrammes
    de caractères, pondéré tf-log et normalisé L2. La similarité cosinus reflète réellement
    le recouvrement lexical (≈ mini-IR vectoriel), pas du bruit comme un hash global.
    Remplaçable à chaud par un vrai modèle (fastembed) sur réseau propre — même interface 384d.
    """
    vec = [0.0] * dim
    if not text:
        return vec
    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        return vec
    tf: dict[str, int] = {}
    for tok in tokens:
        tf[tok] = tf.get(tok, 0) + 1
    for tok, count in tf.items():
        weight = 1.0 + math.log(count)
        b, s = _hash_bucket("w:" + tok, dim)
        vec[b] += s * weight
        padded = f"#{tok}#"
        for i in range(len(padded) - 2):  # trigrammes de caractères
            tb, ts = _hash_bucket("c:" + padded[i : i + 3], dim)
            vec[tb] += ts * 0.5
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm > 1e-12 else vec


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    vectors: List[List[float]]
    real: bool = True


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
    vectors, real = _embed_texts(payload.texts)
    return EmbedResponse(
        model=EMBEDDING_MODEL_NAME if real else "lexical-hashing-384",
        dimensions=EMBEDDING_DIM,
        vectors=vectors,
        real=real,
    )


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
