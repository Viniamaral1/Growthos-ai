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
from app.schemas.marketing import (
    MarketingContentRequest,
    MarketingContentResponse,
    MarketingSource,
)
from app.services.embedding_service import (
    cosine_similarity_score,
    create_query_embedding,
)
from app.services.marketing_service import (
    MarketingGenerationError,
    generate_marketing_content,
)


router = APIRouter(
    prefix="/marketing",
    tags=["Marketing Studio"],
)


DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


@router.post(
    "/generate",
    response_model=MarketingContentResponse,
)
def generate_marketing_campaign(
    request: MarketingContentRequest,
    database: DatabaseSession,
) -> MarketingContentResponse:
    """
    Generate grounded marketing content from company documents.
    """

    company = database.get(
        Company,
        request.company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    retrieval_query = " ".join(
        [
            request.campaign_brief,
            request.target_audience
            or company.target_audience,
            company.product_description,
        ]
    )

    query_embedding = create_query_embedding(
        retrieval_query
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
            == request.company_id
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

        if score < request.minimum_score:
            continue

        ranked_sources.append(
            {
                "document_name": (
                    document.original_filename
                ),
                "page_number": (
                    chunk.page_number
                ),
                "text": chunk.text,
                "similarity_score": round(
                    score,
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
        : request.retrieval_limit
    ]

    labelled_sources = [
        {
            **source,
            "source_id": f"S{index}",
        }
        for index, source in enumerate(
            selected_sources,
            start=1,
        )
    ]

    try:
        variants, model_name = (
            generate_marketing_content(
                platform=request.platform,
                objective=request.objective,
                campaign_brief=(
                    request.campaign_brief
                ),
                target_audience=(
                    request.target_audience
                    or company.target_audience
                ),
                tone=(
                    request.tone
                    or company.brand_tone
                ),
                number_of_variants=(
                    request.number_of_variants
                ),
                sources=labelled_sources,
            )
        )

    except MarketingGenerationError as error:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=str(error),
        ) from error

    response_sources = [
        MarketingSource(
            source_id=str(
                source["source_id"]
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

    return MarketingContentResponse(
        company_id=request.company_id,
        platform=request.platform,
        objective=request.objective,
        model=model_name,
        variants=variants,
        sources=response_sources,
    )