from datetime import datetime

from pydantic import BaseModel, Field


class SwotAnalysis(BaseModel):
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)
    threats: list[str] = Field(default_factory=list)


class CustomerSegment(BaseModel):
    name: str
    description: str
    needs: list[str] = Field(default_factory=list)
    recommended_message: str


class RoadmapPhase(BaseModel):
    period: str
    objective: str
    actions: list[str] = Field(default_factory=list)
    success_measure: str


class BusinessPlanContent(BaseModel):
    executive_summary: str
    opportunity: str
    target_market: str
    customer_segments: list[CustomerSegment]
    value_proposition: str
    business_model_recommendations: list[str]
    go_to_market_strategy: list[str]
    marketing_strategy: list[str]
    swot: SwotAnalysis
    key_risks: list[str]
    research_priorities: list[str]
    ninety_day_roadmap: list[RoadmapPhase]
    next_actions: list[str]
    assumptions_and_limitations: list[str]


class BusinessPlanResponse(BaseModel):
    company_id: int
    company_name: str
    model: str
    generated_at: datetime
    plan: BusinessPlanContent
