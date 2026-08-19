"""Scoring Smart-Assign : similarité sémantique (placeholder déterministe) + ranking par historique.

Logique métier pure, sans I/O. Consommée par le backend Java pour classer les assignés candidats.
"""
from __future__ import annotations

from typing import List

from app.core.vector_math import clamp01, cosine_similarity, stable_vector
from app.schemas import CandidateFeature, CandidateScore, CandidateText

# Pondérations du ranking par historique (somme = 1.0).
_W_ACCEPTED = 0.25
_W_RESOLVED = 0.30
_W_EXPERIENCE = 0.15
_W_WORKLOAD = 0.15
_W_AVAILABILITY = 0.10
_W_LABEL_MATCH = 0.05
_EXPERIENCE_CAP = 20.0  # nb d'assignations passées pour saturer le score d'expérience


class SmartAssignService:
    """Deux stratégies de score, combinées côté backend."""

    def semantic_score(self, issue_text: str, candidates: List[CandidateText]) -> List[CandidateScore]:
        """Proximité sémantique issue ↔ candidat, normalisée dans [0, 1]."""
        issue_vector = stable_vector(issue_text)
        return [
            CandidateScore(
                candidate_id=candidate.candidate_id,
                score=clamp01((cosine_similarity(issue_vector, stable_vector(candidate.text)) + 1.0) / 2.0),
            )
            for candidate in candidates
        ]

    def history_rank(self, candidates: List[CandidateFeature]) -> List[CandidateScore]:
        """Score pondéré à partir des features d'historique/charge/disponibilité."""
        scores: List[CandidateScore] = []
        for candidate in candidates:
            f = candidate.features
            experience = min(1.0, float(f.get("past_assignments", 0.0)) / _EXPERIENCE_CAP)
            score = (
                float(f.get("accepted_rate", 0.0)) * _W_ACCEPTED
                + float(f.get("resolved_rate", 0.0)) * _W_RESOLVED
                + experience * _W_EXPERIENCE
                + (float(f.get("workload_score", 0.0)) / 100.0) * _W_WORKLOAD
                + (float(f.get("availability", 0.0)) / 100.0) * _W_AVAILABILITY
                + (float(f.get("label_match_score", 0.0)) / 100.0) * _W_LABEL_MATCH
            )
            scores.append(CandidateScore(candidate_id=candidate.candidate_id, score=clamp01(score)))
        return scores
