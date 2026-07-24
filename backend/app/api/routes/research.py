from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.document import Document
from app.models.research_evidence import ResearchEvidence
from app.models.research_task import ResearchTask
from app.schemas.research import (
    ResearchEvidenceCreate,
    ResearchEvidenceResponse,
    ResearchSummary,
    ResearchTaskResponse,
    ResearchTaskUpdate,
)
from app.services.research_engine_service import generate_research_tasks


router = APIRouter(
    prefix="/research",
    tags=["Research Engine"],
)

DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


def _document_name(
    database: Session,
    document_id: int | None,
) -> str | None:
    if document_id is None:
        return None

    document = database.get(Document, document_id)
    return document.original_filename if document else None


def _task_response(
    database: Session,
    task: ResearchTask,
) -> ResearchTaskResponse:
    evidence_items = database.scalars(
        select(ResearchEvidence)
        .where(
            ResearchEvidence.research_task_id == task.id
        )
        .order_by(
            ResearchEvidence.created_at.desc(),
            ResearchEvidence.id.desc(),
        )
    ).all()

    return ResearchTaskResponse(
        id=task.id,
        company_id=task.company_id,
        task_key=task.task_key,
        title=task.title,
        description=task.description,
        reason=task.reason,
        recommended_action=task.recommended_action,
        evidence_required=task.evidence_required,
        category=task.category,
        priority=task.priority,
        status=task.status,
        confidence_score=task.confidence_score,
        risk_score=task.risk_score,
        source=task.source,
        evidence=[
            ResearchEvidenceResponse(
                id=evidence.id,
                research_task_id=evidence.research_task_id,
                document_id=evidence.document_id,
                document_name=_document_name(
                    database,
                    evidence.document_id,
                ),
                title=evidence.title,
                summary=evidence.summary,
                evidence_type=evidence.evidence_type,
                created_at=evidence.created_at,
            )
            for evidence in evidence_items
        ],
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _summary(
    database: Session,
    company_id: int,
) -> ResearchSummary:
    tasks = list(
        database.scalars(
            select(ResearchTask)
            .where(
                ResearchTask.company_id == company_id
            )
            .order_by(
                ResearchTask.risk_score.desc(),
                ResearchTask.id.asc(),
            )
        ).all()
    )

    total = len(tasks)
    validated = sum(
        task.status == "validated"
        for task in tasks
    )
    open_tasks = sum(
        task.status
        not in {"validated", "dismissed"}
        for task in tasks
    )
    critical = sum(
        task.priority == "critical"
        and task.status
        not in {"validated", "dismissed"}
        for task in tasks
    )

    evidence_count = int(
        database.scalar(
            select(func.count(ResearchEvidence.id))
            .join(
                ResearchTask,
                ResearchTask.id
                == ResearchEvidence.research_task_id,
            )
            .where(
                ResearchTask.company_id == company_id
            )
        )
        or 0
    )

    average_confidence = (
        round(
            sum(task.confidence_score for task in tasks)
            / total
        )
        if total
        else 0
    )

    average_risk = (
        round(
            sum(task.risk_score for task in tasks)
            / total
        )
        if total
        else 0
    )

    completion_component = (
        round(validated / total * 60)
        if total
        else 0
    )
    evidence_component = min(
        evidence_count * 8,
        25,
    )
    confidence_component = round(
        average_confidence * 0.15
    )

    research_health = min(
        completion_component
        + evidence_component
        + confidence_component,
        100,
    )

    return ResearchSummary(
        company_id=company_id,
        total_tasks=total,
        validated_tasks=validated,
        open_tasks=open_tasks,
        critical_tasks=critical,
        evidence_count=evidence_count,
        research_health_score=research_health,
        average_confidence=average_confidence,
        average_risk=average_risk,
        tasks=[
            _task_response(database, task)
            for task in tasks
        ],
    )


@router.get(
    "/{company_id}",
    response_model=ResearchSummary,
)
def get_research_summary(
    company_id: int,
    database: DatabaseSession,
) -> ResearchSummary:
    company = database.get(Company, company_id)

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    existing_task_count = int(
        database.scalar(
            select(func.count(ResearchTask.id))
            .where(
                ResearchTask.company_id == company_id
            )
        )
        or 0
    )

    if existing_task_count == 0:
        generate_research_tasks(database, company)

    return _summary(database, company_id)


@router.post(
    "/{company_id}/generate",
    response_model=ResearchSummary,
)
def regenerate_research_tasks(
    company_id: int,
    database: DatabaseSession,
) -> ResearchSummary:
    company = database.get(Company, company_id)

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    generate_research_tasks(database, company)
    return _summary(database, company_id)


@router.patch(
    "/tasks/{task_id}",
    response_model=ResearchTaskResponse,
)
def update_research_task(
    task_id: int,
    payload: ResearchTaskUpdate,
    database: DatabaseSession,
) -> ResearchTaskResponse:
    task = database.get(ResearchTask, task_id)

    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research task not found.",
        )

    task.status = payload.status

    if payload.status == "validated":
        task.confidence_score = max(
            task.confidence_score,
            80,
        )
        task.risk_score = min(
            task.risk_score,
            30,
        )
    elif payload.status == "in_progress":
        task.confidence_score = max(
            task.confidence_score,
            35,
        )
    elif payload.status == "planned":
        task.confidence_score = max(
            task.confidence_score,
            25,
        )

    database.add(task)
    database.commit()
    database.refresh(task)

    return _task_response(database, task)


@router.post(
    "/tasks/{task_id}/evidence",
    response_model=ResearchTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_research_evidence(
    task_id: int,
    payload: ResearchEvidenceCreate,
    database: DatabaseSession,
) -> ResearchTaskResponse:
    task = database.get(ResearchTask, task_id)

    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research task not found.",
        )

    if payload.document_id is not None:
        document = database.get(
            Document,
            payload.document_id,
        )

        if (
            document is None
            or document.company_id != task.company_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found for this workspace.",
            )

    evidence = ResearchEvidence(
        research_task_id=task.id,
        document_id=payload.document_id,
        title=payload.title.strip(),
        summary=payload.summary.strip(),
        evidence_type=payload.evidence_type.strip(),
    )

    database.add(evidence)

    if task.status == "missing":
        task.status = "in_progress"

    task.confidence_score = min(
        task.confidence_score + 15,
        100,
    )
    task.risk_score = max(
        task.risk_score - 12,
        0,
    )

    database.add(task)
    database.commit()
    database.refresh(task)

    return _task_response(database, task)
