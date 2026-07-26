from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DecisionStatus = Literal[
    "proposed",
    "accepted",
    "rejected",
    "in_progress",
    "completed",
]


class DecisionCreate(BaseModel):
    company_id: int = Field(gt=0)
    conversation_id: int | None = Field(default=None, gt=0)
    message_id: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=3, max_length=180)
    summary: str = Field(min_length=3, max_length=12000)
    owner_role: str | None = Field(default=None, max_length=40)
    source_executive_role: str | None = Field(
        default=None,
        max_length=40,
    )
    confidence_level: str | None = Field(default=None, max_length=20)
    confidence_score: int | None = Field(
        default=None,
        ge=0,
        le=100,
    )


class DecisionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    status: DecisionStatus | None = None
    owner_role: str | None = Field(default=None, max_length=40)
    handoff_note: str | None = Field(default=None, max_length=3000)


class DecisionResponse(BaseModel):
    id: int
    company_id: int
    conversation_id: int | None
    message_id: int | None
    title: str
    summary: str
    status: DecisionStatus
    owner_role: str | None
    source_executive_role: str | None
    confidence_level: str | None
    confidence_score: int | None
    handoff_note: str | None
    created_at: datetime
    updated_at: datetime
