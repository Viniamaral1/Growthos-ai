from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ResearchProjectStatus = Literal["discovery", "ready", "planned", "archived"]


class ResearchQuestion(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    question: str = Field(min_length=3, max_length=500)
    why_it_matters: str = Field(min_length=3, max_length=700)
    required: bool = True
    suggested_answer: str | None = Field(default=None, max_length=500)


class ResearchDiscovery(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    project_type: str = Field(min_length=2, max_length=80)
    objective: str = Field(min_length=10, max_length=1500)
    questions: list[ResearchQuestion] = Field(default_factory=list, max_length=10)
    assumptions: list[str] = Field(default_factory=list, max_length=12)


class ResearchPlanSection(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    purpose: str = Field(min_length=5, max_length=800)
    research_questions: list[str] = Field(default_factory=list, max_length=10)
    evidence_needed: list[str] = Field(default_factory=list, max_length=10)
    analysis_method: str = Field(min_length=3, max_length=700)


class ResearchPlanContent(BaseModel):
    objective: str = Field(min_length=10, max_length=1800)
    scope: list[str] = Field(default_factory=list, max_length=12)
    exclusions: list[str] = Field(default_factory=list, max_length=12)
    sections: list[ResearchPlanSection] = Field(min_length=1, max_length=12)
    source_strategy: list[str] = Field(default_factory=list, max_length=12)
    evaluation_criteria: list[str] = Field(default_factory=list, max_length=12)
    assumptions: list[str] = Field(default_factory=list, max_length=15)
    risks_and_limitations: list[str] = Field(default_factory=list, max_length=15)
    proposed_deliverables: list[str] = Field(default_factory=list, max_length=10)
    next_actions: list[str] = Field(default_factory=list, max_length=10)


class ResearchProjectCreate(BaseModel):
    goal: str = Field(min_length=10, max_length=5000)
    context: str | None = Field(default=None, max_length=5000)
    deliverable_type: str = Field(default="research_report", min_length=2, max_length=60)


class ResearchAnswerUpdate(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)


class ResearchProjectResponse(BaseModel):
    id: int
    company_id: int
    title: str
    goal: str
    context: str | None
    status: ResearchProjectStatus
    project_type: str | None
    deliverable_type: str
    questions: list[ResearchQuestion]
    answers: dict[str, str]
    plan: ResearchPlanContent | None
    assumptions: list[str]
    model: str | None
    created_at: datetime
    updated_at: datetime
