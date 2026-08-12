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
    status: OpportunityStatus | None = None
    space_id: int | None = None


class OpportunityPreviewCandidate(BaseModel):
    title: str
    confidence: int
    business_impact: str


class OpportunityPreviewResponse(BaseModel):
    potential_count: int
    knowledge_count: int
    highest_confidence: int | None = None
    reasons: list[str] = []
    candidates: list[OpportunityPreviewCandidate] = []


class OpportunityReviewStateResponse(BaseModel):
    needs_review: bool
    latest_knowledge_at: datetime | None = None
    last_reviewed_at: datetime | None = None


class OpportunityLifecycleSource(BaseModel):
    knowledge_item_id: int | None = None
    document_id: int | None = None
    document_name: str | None = None
    label: str
    value: str
    role: Literal["current", "historical", "supporting"] = "supporting"


class OpportunityLifecycleImpact(BaseModel):
    opportunity_id: int
    title: str
    knowledge_facts: int = 0
    source_documents: int = 0
    calendar_candidates: int = 0
    graph_entities: int = 0
    sources: list[OpportunityLifecycleSource] = []
    guidance: list[str] = []
