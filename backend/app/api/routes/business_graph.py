from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.business_graph import (
    BusinessEntityBatchResponse,
    BusinessEntityDetail,
    BusinessEntityMapResponse,
    BusinessEntityRebuildResponse,
    BusinessGraphResponse,
)
from app.services.business_graph_service import build_business_graph, get_business_entity_detail
from app.services.entity_extraction_service import (
    map_document_entities,
    map_new_document_entities,
    queue_entity_rebuild,
)

router = APIRouter(prefix="/business-graph", tags=["business-graph"])


@router.get("", response_model=BusinessGraphResponse)
def get_business_graph(
    company_id: int = Query(..., ge=1),
    database: Session = Depends(get_db),
) -> BusinessGraphResponse:
    try:
        return build_business_graph(database, company_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get(
    "/{company_id}/entities/{entity_id}",
    response_model=BusinessEntityDetail,
)
def get_entity_detail(
    company_id: int,
    entity_id: int,
    database: Session = Depends(get_db),
) -> BusinessEntityDetail:
    """Return one entity with its grounded evidence and related entities."""
    try:
        return get_business_entity_detail(database, company_id, entity_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post(
    "/{company_id}/entities/documents/{document_id}",
    response_model=BusinessEntityMapResponse,
)
def map_document(
    company_id: int,
    document_id: int,
    database: Session = Depends(get_db),
) -> BusinessEntityMapResponse:
    """Map entities from exactly one processed document."""
    try:
        return BusinessEntityMapResponse(**map_document_entities(database, company_id, document_id))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post(
    "/{company_id}/entities/new-documents",
    response_model=BusinessEntityBatchResponse,
)
def map_new_documents(
    company_id: int,
    batch_size: int = Query(default=1, ge=1, le=2),
    database: Session = Depends(get_db),
) -> BusinessEntityBatchResponse:
    """Map only documents that have not completed entity extraction yet."""
    try:
        return BusinessEntityBatchResponse(**map_new_document_entities(database, company_id, batch_size))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post(
    "/{company_id}/entities/rebuild",
    response_model=BusinessEntityRebuildResponse,
)
def rebuild_entities(
    company_id: int,
    database: Session = Depends(get_db),
) -> BusinessEntityRebuildResponse:
    """Queue a safe incremental rebuild without deleting the current entity map."""
    try:
        return BusinessEntityRebuildResponse(**queue_entity_rebuild(database, company_id))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
