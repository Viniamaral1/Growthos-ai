from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.business_graph import BusinessGraphResponse
from app.services.business_graph_service import build_business_graph

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
