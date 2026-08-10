from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentResponse(BaseModel):
    """
    Information returned for an uploaded document.
    """

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    company_id: int
    original_filename: str
    content_type: str
    file_size: int
    processing_status: str
    page_count: int | None
    character_count: int | None
    processing_error: str | None
    uploaded_at: datetime
    processed_at: datetime | None
    entity_mapping_status: str = "not_mapped"
    entity_count: int = 0
    entity_mapping_error: str | None = None
    entity_mapped_at: datetime | None = None
    project_space_id: int | None = None
    project_space_name: str | None = None
    knowledge_status: str = "not_captured"
    knowledge_item_count: int = 0
    knowledge_space_id: int | None = None
    knowledge_space_name: str | None = None


class DocumentTextResponse(BaseModel):
    """
    Extracted text and processing information for one document.
    """

    id: int
    original_filename: str
    processing_status: str
    page_count: int | None
    character_count: int | None
    extracted_text: str | None

class DocumentRelevanceResponse(BaseModel):
    document_id: int
    company_id: int
    company_name: str
    level: str
    confidence: int
    recommendation: str
    reasons: list[str]
    suggested_company_id: int | None = None
    suggested_company_name: str | None = None
    target_space_id: int | None = None
    target_space_name: str | None = None
    suggested_space_id: int | None = None
    suggested_space_name: str | None = None
    suggested_new_space_name: str | None = None
    target_confidence: int | None = None
    best_space_id: int | None = None
    best_space_name: str | None = None
    best_confidence: int | None = None
    best_is_stronger: bool = False
    no_confident_existing_match: bool = False
    confidence_breakdown: dict[str, int] = Field(default_factory=dict)
    detected_domains: list[str] = Field(default_factory=list)
    project_domains: list[str] = Field(default_factory=list)
    penalties: list[str] = Field(default_factory=list)
    method: str


class IntelligentIngestionResponse(BaseModel):
    document_id: int
    company_id: int
    asset_kind: str
    category: str
    classification_confidence: int
    classification_signals: list[str]
    decision: str
    relevance: DocumentRelevanceResponse
    recommended_actions: list[str]


class DuplicateCheckResponse(BaseModel):
    duplicate_type: str
    existing_document_id: int | None = None
    existing_filename: str | None = None
    exact_content_match: bool = False
    same_filename: bool = False
    same_size: bool = False
    message: str


class DocumentRouteResponse(BaseModel):
    document_id: int
    space_id: int
    space_name: str
    message: str


class DocumentKnowledgeCaptureResponse(BaseModel):
    document_id: int
    space_id: int
    knowledge_item_id: int
    title: str
    message: str


class KnowledgeFactProposal(BaseModel):
    key: str
    title: str
    value: str
    summary: str
    item_type: str
    confidence: int
    evidence: str
    existing_item_id: int | None = None
    existing_value: str | None = None
    relationship: str = "new"
    calendar_candidate: bool = False
    calendar_reason: str | None = None


class DocumentKnowledgePreviewResponse(BaseModel):
    document_id: int
    space_id: int
    space_name: str
    ai_enriched: bool
    facts: list[KnowledgeFactProposal]


class KnowledgeFactSelection(BaseModel):
    key: str
    title: str | None = None
    value: str | None = None
    action: str = "create"


class DocumentKnowledgeCaptureRequest(BaseModel):
    space_id: int
    facts: list[KnowledgeFactSelection]


class DocumentKnowledgeBulkCaptureResponse(BaseModel):
    document_id: int
    space_id: int
    knowledge_item_ids: list[int]
    created_or_updated: int
    message: str
