from typing import Literal

from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    """Information required for semantic document search."""

    company_id: int = Field(gt=0, examples=[1])
    query: str = Field(
        min_length=3,
        max_length=500,
        examples=["What services does this company provide?"],
    )
    limit: int = Field(default=5, ge=1, le=20)
    minimum_score: float = Field(default=0.20, ge=-1.0, le=1.0)


class SemanticSearchResult(BaseModel):
    """One matching document chunk."""

    chunk_id: int
    document_id: int
    document_name: str
    page_number: int | None
    chunk_index: int
    text: str
    similarity_score: float


class SemanticSearchResponse(BaseModel):
    """Ranked semantic-search results."""

    company_id: int
    query: str
    result_count: int
    results: list[SemanticSearchResult]


WorkspaceSearchSource = Literal["knowledge", "chat"]
WorkspaceSearchScope = Literal["knowledge", "chat"]
ChatSearchMode = Literal[
    "summaries",
    "current",
    "recent_5",
    "recent_20",
    "saved",
    "full_history",
]
SearchPerformanceMode = Literal["safe", "balanced", "deep"]


class WorkspaceSemanticSearchRequest(BaseModel):
    """Search one bounded workspace source at a time."""

    company_id: int = Field(gt=0)
    query: str = Field(min_length=3, max_length=500)
    limit: int = Field(default=8, ge=1, le=12)
    minimum_score: float = Field(default=0.32, ge=-1.0, le=1.0)
    active_space_id: int | None = Field(default=None, gt=0)
    scope: WorkspaceSearchScope = "knowledge"
    current_space_only: bool = False
    chat_mode: ChatSearchMode = "summaries"
    performance_mode: SearchPerformanceMode = "safe"
    current_conversation_id: int | None = Field(default=None, gt=0)


class WorkspaceSemanticSearchResult(BaseModel):
    """One bounded match from Knowledge or conversation history."""

    source_type: WorkspaceSearchSource
    source_id: int
    title: str
    snippet: str
    content: str
    similarity_score: float
    created_at: str
    space_id: int | None = None
    space_name: str | None = None
    item_type: str | None = None
    conversation_id: int | None = None
    conversation_title: str | None = None
    message_role: str | None = None


class WorkspaceSemanticSearchResponse(BaseModel):
    """Ranked workspace search results."""

    company_id: int
    query: str
    result_count: int
    searched_knowledge: bool
    searched_chat: bool
    search_strategy: str = "semantic"
    indexed_history_available: bool = False
    results: list[WorkspaceSemanticSearchResult]
