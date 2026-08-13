from __future__ import annotations

from pydantic import BaseModel


class EvidenceScoreFactor(BaseModel):
    key: str
    label: str
    score: int
    maximum: int
    detail: str


class EvidenceSourceSummary(BaseModel):
    document_id: int | None
    document_name: str | None
    source_type: str
    authority_score: int
    is_current: bool
    is_superseded: bool


class EvidenceScoreItem(BaseModel):
    knowledge_item_id: int
    space_id: int
    title: str
    value: str
    overall_score: int
    level: str
    source_count: int
    active_contradictions: int
    resolved_contradictions: int
    age_days: int | None
    factors: list[EvidenceScoreFactor]
    sources: list[EvidenceSourceSummary]
    strengths: list[str]
    cautions: list[str]
    recommendation: str


class EvidenceScoreSummary(BaseModel):
    company_id: int
    space_id: int | None
    total_items: int
    strong_items: int
    moderate_items: int
    weak_items: int
    average_score: int | None
    active_contradictions: int
    multi_source_items: int
    stale_items: int
    items: list[EvidenceScoreItem]
    explanation: str
