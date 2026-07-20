from pydantic import BaseModel, Field


class GroundedAnswerRequest(BaseModel):
    """
    Information required to answer a question using company documents.
    """

    company_id: int = Field(
        gt=0,
        examples=[1],
    )

    document_id: int | None = Field(
        default=None,
        gt=0,
        description=(
            "When provided, retrieval is limited to this document. "
            "When omitted, all processed company documents are searched."
        ),
    )

    question: str = Field(
        min_length=3,
        max_length=1000,
        examples=[
            "What experience is described in this CV?"
        ],
    )

    retrieval_limit: int = Field(
        default=3,
        ge=1,
        le=6,
    )

    minimum_score: float = Field(
        default=0.20,
        ge=-1.0,
        le=1.0,
    )


class AnswerSource(BaseModel):
    """
    Source passage used to create the answer.
    """

    source_id: str
    chunk_id: int
    document_id: int
    document_name: str
    page_number: int | None
    similarity_score: float
    text: str


class GroundedAnswerResponse(BaseModel):
    """
    Grounded answer and supporting document sources.
    """

    company_id: int
    document_id: int | None
    document_name: str | None
    question: str
    answer: str
    model: str
    source_count: int
    sources: list[AnswerSource]
