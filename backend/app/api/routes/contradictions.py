from typing import Annotated
from fastapi import APIRouter,Depends,HTTPException,Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.company import Company
from app.models.contradiction import ContradictionRecord
from app.schemas.contradiction import ContradictionResponse,ContradictionStatusUpdate
from app.services.contradiction_detection_service import detect_contradictions,serialize_contradiction
router=APIRouter(prefix='/contradictions',tags=['Contradiction Intelligence']); DB=Annotated[Session,Depends(get_db)]
@router.get('',response_model=list[ContradictionResponse])
def list_items(company_id:int,database:DB,space_id:int|None=None,status:str|None=Query(default=None,pattern='^(detected|confirmed|dismissed|resolved)$')):
    if database.get(Company,company_id) is None:raise HTTPException(404,'Workspace not found.')
    q=select(ContradictionRecord).where(ContradictionRecord.company_id==company_id)
    if space_id is not None:q=q.where(ContradictionRecord.space_id==space_id)
    if status:q=q.where(ContradictionRecord.status==status)
    return [serialize_contradiction(database,r) for r in database.scalars(q.order_by(ContradictionRecord.updated_at.desc())).all()]
@router.post('/refresh',response_model=list[ContradictionResponse])
def refresh(company_id:int,database:DB,space_id:int|None=None):
    if database.get(Company,company_id) is None:raise HTTPException(404,'Workspace not found.')
    return [serialize_contradiction(database,r) for r in detect_contradictions(database,company_id,space_id)]
@router.patch('/{item_id}',response_model=ContradictionResponse)
def update(item_id:int,payload:ContradictionStatusUpdate,database:DB):
    r=database.get(ContradictionRecord,item_id)
    if not r:raise HTTPException(404,'Contradiction not found.')
    r.status=payload.status;database.add(r);database.commit();database.refresh(r);return serialize_contradiction(database,r)
