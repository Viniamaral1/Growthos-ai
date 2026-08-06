from pydantic import BaseModel, Field


class BusinessGraphNode(BaseModel):
    id: str
    kind: str
    label: str
    subtitle: str | None = None
    status: str | None = None
    importance: int = Field(default=1, ge=1, le=5)
    source_id: int | None = None


class BusinessGraphEdge(BaseModel):
    source: str
    target: str
    relationship: str


class BusinessGraphInsight(BaseModel):
    level: str
    title: str
    summary: str
    evidence: list[str] = []
    recommended_action: str | None = None
    target_kind: str | None = None


class BusinessGraphResponse(BaseModel):
    company_id: int
    generated_from: dict[str, int]
    health_score: int = Field(ge=0, le=100)
    health_label: str
    executive_summary: str
    nodes: list[BusinessGraphNode]
    edges: list[BusinessGraphEdge]
    insights: list[BusinessGraphInsight]
