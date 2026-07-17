import json
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
                "page_number": (
                    chunk.page_number
                ),
                "chunk_index": (
                    chunk.chunk_index
                ),
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

    selected_sources = ranked_sources[
        : answer_request.retrieval_limit
    ]

    labelled_sources: list[
        dict[str, object]
    ] = []

    for index, source in enumerate(
        selected_sources,
        start=1,
    ):
        labelled_sources.append(
            {
                **source,
                "source_id": f"S{index}",
            }
        )

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
        question=answer_request.question,
        answer=answer,
        model=model_name,
        source_count=len(
            response_sources
        ),
        sources=response_sources,
    )