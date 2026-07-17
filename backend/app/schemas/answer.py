from pydantic import BaseModel, Field


class GroundedAnswerRequest(BaseModel):
    """
    Information required to answer a question using company documents.
    """

    company_id: int = Field(
        gt=0,
        examples=[1],
    )

    question: str = Field(
        min_length=3,
        max_length=1000,
        examples=[
            "What products and services does this company provide?"
        ],
    )

    retrieval_limit: int = Field(
        default=5,
        ge=1,
        le=10,
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
    question: str
    answer: str
    model: str
    source_count: int
    sources: list[AnswerSource]