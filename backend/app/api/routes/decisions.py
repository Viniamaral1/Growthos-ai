from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.decision import Decision
from app.schemas.decision import (
    DecisionCreate,
    DecisionResponse,
    DecisionUpdate,
)


router = APIRouter(
    prefix="/decisions",
    tags=["Decision Intelligence"],
)

DatabaseSession = Annotated[Session, Depends(get_db)]


def _response(decision: Decision) -> DecisionResponse:
    return DecisionResponse.model_validate(
        {
            column.name: getattr(decision, column.name)
            for column in Decision.__table__.columns
        }
    )


@router.get("", response_model=list[DecisionResponse])
def list_decisions(
    database: DatabaseSession,
    company_id: int = Query(gt=0),
) -> list[DecisionResponse]:
    rows = database.scalars(
        select(Decision)
        .where(Decision.company_id == company_id)
        .order_by(Decision.updated_at.desc())
    ).all()
    return [_response(item) for item in rows]


@router.post(
    "",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_decision(
    payload: DecisionCreate,
    database: DatabaseSession,
) -> DecisionResponse:
    if database.get(Company, payload.company_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    decision = Decision(
        **payload.model_dump(),
        status="proposed",
    )
    database.add(decision)
    database.commit()
    database.refresh(decision)
    return _response(decision)


@router.patch(
    "/{decision_id}",
    response_model=DecisionResponse,
)
def update_decision(
    decision_id: int,
    payload: DecisionUpdate,
    database: DatabaseSession,
) -> DecisionResponse:
    decision = database.get(Decision, decision_id)

    if decision is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision not found.",
        )

    for key, value in payload.model_dump(
        exclude_unset=True
    ).items():
        setattr(decision, key, value)

    decision.updated_at = datetime.now(timezone.utc)
    database.add(decision)
    database.commit()
    database.refresh(decision)
    return _response(decision)


@router.delete(
    "/{decision_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_decision(
    decision_id: int,
    database: DatabaseSession,
) -> None:
    decision = database.get(Decision, decision_id)

    if decision is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Decision not found.",
        )

    database.delete(decision)
    database.commit()
