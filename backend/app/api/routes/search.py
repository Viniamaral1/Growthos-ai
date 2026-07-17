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
from app.schemas.search import (
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticSearchResult,
)
from app.services.embedding_service import (
    cosine_similarity_score,
    create_query_embedding,
)


router = APIRouter(
    prefix="/search",
    tags=["Semantic Search"],
)


DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


@router.post(
    "/semantic",
    response_model=SemanticSearchResponse,
)
def semantic_search(
    search_request: SemanticSearchRequest,
    database: DatabaseSession,
) -> SemanticSearchResponse:
    """
    Search company documents using vector similarity.
    """

    company = database.get(
        Company,
        search_request.company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    query_embedding = create_query_embedding(
        search_request.query
    )

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
            == search_request.company_id
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

    ranked_results: list[
        SemanticSearchResult
    ] = []

    for chunk, document in rows:
        if not chunk.embedding_json:
            continue

        try:
            stored_embedding = json.loads(
                chunk.embedding_json
            )

            score = cosine_similarity_score(
                query_embedding,
                stored_embedding,
            )

        except (
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ):
            continue

        if score < search_request.minimum_score:
            continue

        ranked_results.append(
            SemanticSearchResult(
                chunk_id=chunk.id,
                document_id=document.id,
                document_name=(
                    document.original_filename
                ),
                page_number=chunk.page_number,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                similarity_score=round(
                    score,
                    4,
                ),
            )
        )

    ranked_results.sort(
        key=lambda result: (
            result.similarity_score
        ),
        reverse=True,
    )

    selected_results = ranked_results[
        : search_request.limit
    ]

    return SemanticSearchResponse(
        company_id=search_request.company_id,
        query=search_request.query,
        result_count=len(
            selected_results
        ),
        results=selected_results,
    )