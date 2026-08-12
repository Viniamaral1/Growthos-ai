from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


OpportunityStatus = Literal["detected", "confirmed", "dismissed", "resolved", "expired"]


class OpportunityEvidence(BaseModel):
    knowledge_item_id: int | None = None
    document_id: int | None = None
    document_name: str | None = None
    label: str
    value: str
    source_quality: str | None = None
    role: Literal["current", "historical", "supporting"] = "supporting"


class OpportunityConfidenceFactor(BaseModel):
    label: str
    contribution: int
    detail: str | None = None


class OpportunityResponse(BaseModel):
    id: int
    company_id: int
    space_id: int | None
    space_name: str | None
    status: OpportunityStatus
    opportunity_type: str
    title: str
    summary: str
    confidence: int = Field(ge=0, le=100)
    confidence_factors: list[OpportunityConfidenceFactor] = []
    severity: Literal["info", "positive", "warning"]
    current_value: str | None = None
    previous_value: str | None = None
    delta_display: str | None = None
    delta_percent: float | None = None
    explanation: list[str]
    business_impact: str
    recommended_action: str
    entities: list[str]
    evidence: list[OpportunityEvidence]
    detected_at: datetime
    updated_at: datetime


class OpportunityStatusUpdate(BaseModel):
    status: OpportunityStatus


class OpportunityReviewStateResponse(BaseModel):
    needs_review: bool
    latest_knowledge_at: datetime | None = None
    last_reviewed_at: datetime | None = None
