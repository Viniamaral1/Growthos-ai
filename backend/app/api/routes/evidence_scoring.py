from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.evidence_scoring import EvidenceScoreSummary
from app.services.evidence_scoring_service import score_evidence

router = APIRouter(prefix="/evidence-scoring", tags=["evidence-scoring"])


@router.get("", response_model=EvidenceScoreSummary)
def get_evidence_scoring(
    company_id: int = Query(..., gt=0),
    space_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> EvidenceScoreSummary:
    return score_evidence(db, company_id=company_id, space_id=space_id)
