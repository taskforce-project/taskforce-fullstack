"""Endpoints Smart-Assign : score sémantique + ranking par historique."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_smart_assign_service
from app.schemas import HistoryRankRequest, ScoreResponse, SemanticScoreRequest
from app.services.smart_assign_service import SmartAssignService

router = APIRouter(prefix="/v1/smart-assign", tags=["smart-assign"])


@router.post("/semantic-score", response_model=ScoreResponse)
def semantic_score(
    payload: SemanticScoreRequest,
    service: SmartAssignService = Depends(get_smart_assign_service),
) -> ScoreResponse:
    return ScoreResponse(scores=service.semantic_score(payload.issue_text, payload.candidates))


@router.post("/history-rank", response_model=ScoreResponse)
def history_rank(
    payload: HistoryRankRequest,
    service: SmartAssignService = Depends(get_smart_assign_service),
) -> ScoreResponse:
    return ScoreResponse(scores=service.history_rank(payload.candidates))
