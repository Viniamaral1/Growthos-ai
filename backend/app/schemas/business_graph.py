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


class BusinessGraphResponse(BaseModel):
    company_id: int
    generated_from: dict[str, int]
    nodes: list[BusinessGraphNode]
    edges: list[BusinessGraphEdge]
    insights: list[BusinessGraphInsight]
