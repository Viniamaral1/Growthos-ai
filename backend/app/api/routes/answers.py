import json
import re
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.schemas.answer import (
    AnswerSource,
    GroundedAnswerRequest,
    GroundedAnswerResponse,
)
from app.services.answer_service import (
    AnswerGenerationError,
    generate_grounded_answer,
)
from app.services.embedding_service import (
    cosine_similarity_score,
    create_query_embedding,
)


router = APIRouter(
    prefix="/answers",
    tags=["Grounded Answers"],
)


DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


def _normalise_text(value: str) -> str:
    """Create a stable key for near-duplicate passage removal."""

    return re.sub(
        r"\s+",
        " ",
        value.lower().strip(),
    )[:700]


@router.post(
    "/grounded",
    response_model=GroundedAnswerResponse,
)
def create_grounded_answer(
    answer_request: GroundedAnswerRequest,
    database: DatabaseSession,
) -> GroundedAnswerResponse:
    """
    Answer a question using retrieved company-document passages.
    """

    company = database.get(
        Company,
        answer_request.company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    scoped_document: Document | None = None

    if answer_request.document_id is not None:
        scoped_document = database.get(
            Document,
            answer_request.document_id,
        )

        if (
            scoped_document is None
            or scoped_document.company_id
            != answer_request.company_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found for this company.",
            )

        if scoped_document.processing_status != "processed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The selected document is not ready for AI.",
            )

    try:
        query_embedding = create_query_embedding(
            answer_request.question
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    statement = (
        select(
            DocumentChunk,
            Document,
        )
        .join(
            Document,
            Document.id
            == DocumentChunk.document_id,
        )
        .where(
            Document.company_id
            == answer_request.company_id
        )
        .where(
            Document.processing_status
            == "processed"
        )
        .where(
            DocumentChunk.embedding_json.is_not(
                None
            )
        )
    )

    if scoped_document is not None:
        statement = statement.where(
            Document.id == scoped_document.id
        )

    rows = database.execute(
        statement
    ).all()

    ranked_sources: list[
        dict[str, object]
    ] = []

    for chunk, document in rows:
        if not chunk.embedding_json:
            continue

        try:
            stored_embedding = json.loads(
                chunk.embedding_json
            )

            similarity_score = (
                cosine_similarity_score(
                    query_embedding,
                    stored_embedding,
                )
            )
        except (
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ):
            continue

        if (
            similarity_score
            < answer_request.minimum_score
        ):
            continue

        ranked_sources.append(
            {
                "chunk_id": chunk.id,
                "document_id": document.id,
                "document_name": (
                    document.original_filename
                ),
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "similarity_score": round(
                    similarity_score,
                    4,
                ),
            }
        )

    ranked_sources.sort(
        key=lambda source: float(
            source["similarity_score"]
        ),
        reverse=True,
    )

    unique_sources: list[
        dict[str, object]
    ] = []
    seen_passages: set[str] = set()

    for source in ranked_sources:
        normalised = _normalise_text(
            str(source["text"])
        )

        if normalised in seen_passages:
            continue

        seen_passages.add(normalised)
        unique_sources.append(source)

        if (
            len(unique_sources)
            >= answer_request.retrieval_limit
        ):
            break

    labelled_sources = [
        {
            **source,
            "source_id": f"S{index}",
        }
        for index, source in enumerate(
            unique_sources,
            start=1,
        )
    ]

    try:
        answer, model_name = (
            generate_grounded_answer(
                question=answer_request.question,
                sources=labelled_sources,
            )
        )
    except AnswerGenerationError as error:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=str(error),
        ) from error

    response_sources = [
        AnswerSource(
            source_id=str(
                source["source_id"]
            ),
            chunk_id=int(
                source["chunk_id"]
            ),
            document_id=int(
                source["document_id"]
            ),
            document_name=str(
                source["document_name"]
            ),
            page_number=(
                int(source["page_number"])
                if source["page_number"]
                is not None
                else None
            ),
            similarity_score=float(
                source["similarity_score"]
            ),
            text=str(
                source["text"]
            ),
        )
        for source in labelled_sources
    ]

    return GroundedAnswerResponse(
        company_id=answer_request.company_id,
        document_id=(
            scoped_document.id
            if scoped_document is not None
            else None
        ),
        document_name=(
            scoped_document.original_filename
            if scoped_document is not None
            else None
        ),
        question=answer_request.question,
        answer=answer,
        model=model_name,
        source_count=len(
            response_sources
        ),
        sources=response_sources,
    )
