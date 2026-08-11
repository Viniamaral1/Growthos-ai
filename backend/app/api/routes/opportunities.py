from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.opportunity import OpportunityRecord
from app.schemas.opportunity import OpportunityResponse, OpportunityStatusUpdate
from app.services.opportunity_detection_service import detect_opportunities, serialize_opportunity

router = APIRouter(prefix="/opportunities", tags=["Opportunity Intelligence"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[OpportunityResponse])
def list_opportunities(
    company_id: int,
    database: DatabaseSession,
    space_id: int | None = None,
    status: str | None = Query(default=None, pattern="^(detected|confirmed|dismissed)$"),
):
    if database.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    detect_opportunities(database, company_id=company_id, space_id=space_id)
    statement = select(OpportunityRecord).where(OpportunityRecord.company_id == company_id)
    if space_id is not None:
        statement = statement.where(OpportunityRecord.space_id == space_id)
    if status:
        statement = statement.where(OpportunityRecord.status == status)
    records = list(database.scalars(statement.order_by(OpportunityRecord.updated_at.desc())).all())
    return [serialize_opportunity(database, record) for record in records]


@router.post("/refresh", response_model=list[OpportunityResponse])
def refresh_opportunities(company_id: int, database: DatabaseSession, space_id: int | None = None):
    if database.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    records = detect_opportunities(database, company_id=company_id, space_id=space_id)
    return [serialize_opportunity(database, record) for record in records]


@router.patch("/{opportunity_id}", response_model=OpportunityResponse)
def update_opportunity(opportunity_id: int, payload: OpportunityStatusUpdate, database: DatabaseSession):
    record = database.get(OpportunityRecord, opportunity_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Opportunity not found.")
    record.status = payload.status
    database.add(record)
    database.commit()
    database.refresh(record)
    return serialize_opportunity(database, record)
