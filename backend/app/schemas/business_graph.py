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


class BusinessEntityIndexStatus(BaseModel):
    processed_documents: int = Field(ge=0)
    mapped_documents: int = Field(ge=0)
    pending_documents: int = Field(ge=0)
    failed_documents: int = Field(ge=0)


class BusinessGraphResponse(BaseModel):
    company_id: int
    generated_from: dict[str, int]
    health_score: int = Field(ge=0, le=100)
    health_label: str
    executive_summary: str
    nodes: list[BusinessGraphNode]
    edges: list[BusinessGraphEdge]
    insights: list[BusinessGraphInsight]
    entity_index: BusinessEntityIndexStatus


class BusinessEntityMapResponse(BaseModel):
    company_id: int
    source_kind: str
    source_id: int
    created: int = Field(ge=0)
    linked: int = Field(ge=0)
    model: str
    pending_documents: int = Field(ge=0)
    message: str


class BusinessEntityBatchResponse(BaseModel):
    company_id: int
    processed: int = Field(ge=0)
    created: int = Field(ge=0)
    linked: int = Field(ge=0)
    failed: int = Field(ge=0)
    pending_documents: int = Field(ge=0)
    model: str
    message: str
    failures: list[str] = []


class BusinessEntityRebuildResponse(BaseModel):
    company_id: int
    queued_documents: int = Field(ge=0)
    model: str
    message: str
