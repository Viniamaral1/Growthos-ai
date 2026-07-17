from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    """
    Information required for semantic document search.
    """

    company_id: int = Field(
        gt=0,
        examples=[1],
    )

    query: str = Field(
        min_length=3,
        max_length=500,
        examples=[
            "What services does this company provide?"
        ],
    )

    limit: int = Field(
        default=5,
        ge=1,
        le=20,
    )

    minimum_score: float = Field(
        default=0.20,
        ge=-1.0,
        le=1.0,
    )


class SemanticSearchResult(BaseModel):
    """
    One matching document chunk.
    """

    chunk_id: int
    document_id: int
    document_name: str
    page_number: int | None
    chunk_index: int
    text: str
    similarity_score: float


class SemanticSearchResponse(BaseModel):
    """
    Ranked semantic-search results.
    """

    company_id: int
    query: str
    result_count: int
    results: list[SemanticSearchResult]