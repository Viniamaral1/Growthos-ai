from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ResearchPriority = Literal[
    "critical",
    "high",
    "medium",
    "low",
]

ResearchStatus = Literal[
    "missing",
    "planned",
    "in_progress",
    "validated",
    "dismissed",
]


class ResearchTaskUpdate(BaseModel):
    status: ResearchStatus


class ResearchEvidenceCreate(BaseModel):
    title: str = Field(
        min_length=2,
        max_length=180,
    )
    summary: str = Field(
        min_length=5,
        max_length=4000,
    )
    evidence_type: str = Field(
        default="manual",
        min_length=2,
        max_length=40,
    )
    document_id: int | None = Field(
        default=None,
        gt=0,
    )


class ResearchEvidenceResponse(BaseModel):
    id: int
    research_task_id: int
    document_id: int | None
    document_name: str | None
    title: str
    summary: str
    evidence_type: str
    created_at: datetime


class ResearchTaskResponse(BaseModel):
    id: int
    company_id: int
    task_key: str
    title: str
    description: str
    reason: str
    recommended_action: str
    evidence_required: str
    category: str
    priority: ResearchPriority
    status: ResearchStatus
    confidence_score: int
    risk_score: int
    source: str
    evidence: list[ResearchEvidenceResponse]
    created_at: datetime
    updated_at: datetime


class ResearchSummary(BaseModel):
    company_id: int
    total_tasks: int
    validated_tasks: int
    open_tasks: int
    critical_tasks: int
    evidence_count: int
    research_health_score: int
    average_confidence: int
    average_risk: int
    tasks: list[ResearchTaskResponse]
