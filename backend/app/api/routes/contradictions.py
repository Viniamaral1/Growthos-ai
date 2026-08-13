import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.contradiction import ContradictionRecord
from app.models.knowledge_item import KnowledgeItem
from app.models.opportunity import OpportunityRecord
from app.schemas.contradiction import (
    ContradictionDeleteRequest,
    ContradictionLifecycleImpact,
    ContradictionResponse,
    ContradictionStatusUpdate,
)
from app.services.contradiction_detection_service import detect_contradictions, serialize_contradiction

router = APIRouter(prefix="/contradictions", tags=["Contradiction Intelligence"])
DB = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[ContradictionResponse])
def list_items(
    company_id: int,
    database: DB,
    space_id: int | None = None,
    status: str | None = Query(default=None, pattern="^(detected|confirmed|dismissed|resolved)$"),
):
    if database.get(Company, company_id) is None:
        raise HTTPException(404, "Workspace not found.")
    query = select(ContradictionRecord).where(ContradictionRecord.company_id == company_id)
    if space_id is not None:
        query = query.where(ContradictionRecord.space_id == space_id)
    if status:
        query = query.where(ContradictionRecord.status == status)
    records = list(database.scalars(query.order_by(ContradictionRecord.updated_at.desc())).all())
    return [serialize_contradiction(database, record) for record in records]


@router.post("/refresh", response_model=list[ContradictionResponse])
def refresh(company_id: int, database: DB, space_id: int | None = None):
    if database.get(Company, company_id) is None:
        raise HTTPException(404, "Workspace not found.")
    return [serialize_contradiction(database, record) for record in detect_contradictions(database, company_id, space_id)]


@router.patch("/{item_id}", response_model=ContradictionResponse)
def update(item_id: int, payload: ContradictionStatusUpdate, database: DB):
    record = database.get(ContradictionRecord, item_id)
    if not record:
        raise HTTPException(404, "Contradiction not found.")

    record.status = payload.status
    if payload.resolution_choice or payload.note:
        data = json.loads(record.payload_json)
        data["resolution"] = {
            "choice": payload.resolution_choice,
            "note": (payload.note or "").strip() or None,
        }
        record.payload_json = json.dumps(data, ensure_ascii=False)

    database.add(record)
    database.commit()
    database.refresh(record)
    return serialize_contradiction(database, record)


@router.get("/{item_id}/lifecycle-impact", response_model=ContradictionLifecycleImpact)
def lifecycle_impact(item_id: int, database: DB):
    record = database.get(ContradictionRecord, item_id)
    if not record:
        raise HTTPException(404, "Contradiction not found.")

    serialized = serialize_contradiction(database, record)
    evidence = serialized.get("evidence", [])
    knowledge_ids = sorted({entry.get("knowledge_item_id") for entry in evidence if entry.get("knowledge_item_id")})
    document_ids = sorted({entry.get("document_id") for entry in evidence if entry.get("document_id")})

    calendar_candidates = 0
    for knowledge_id in knowledge_ids:
        item = database.get(KnowledgeItem, knowledge_id)
        if item and "calendar-candidate" in (item.tags_json or ""):
            calendar_candidates += 1

    linked_opportunities = 0
    for opportunity in database.scalars(
        select(OpportunityRecord).where(OpportunityRecord.company_id == record.company_id)
    ).all():
        payload = opportunity.payload_json or ""
        if any(f'"knowledge_item_id": {knowledge_id}' in payload for knowledge_id in knowledge_ids):
            linked_opportunities += 1

    return {
        "contradiction_id": record.id,
        "title": record.title,
        "knowledge_facts": len(knowledge_ids),
        "source_documents": len(document_ids),
        "calendar_candidates": calendar_candidates,
        "graph_entities": 0,
        "linked_opportunities": linked_opportunities,
        "evidence": evidence,
        "guidance": [
            "Delete contradiction only removes the contradiction record.",
            "Original Business Intelligence documents remain stored unless they are deleted separately.",
            "Removing related Knowledge can affect future Opportunity and Contradiction reviews.",
        ],
    }


@router.post("/{item_id}/delete", status_code=204)
def delete_with_scope(item_id: int, payload: ContradictionDeleteRequest, database: DB):
    record = database.get(ContradictionRecord, item_id)
    if not record:
        raise HTTPException(404, "Contradiction not found.")

    if payload.mode in {"contradiction_and_knowledge", "remove_evidence"}:
        serialized = serialize_contradiction(database, record)
        allowed_ids = {
            int(entry["knowledge_item_id"])
            for entry in serialized.get("evidence", [])
            if entry.get("knowledge_item_id")
        }
        requested_ids = {int(value) for value in payload.knowledge_item_ids}
        for knowledge_id in requested_ids.intersection(allowed_ids):
            item = database.get(KnowledgeItem, knowledge_id)
            if item is not None:
                database.delete(item)

    database.delete(record)
    database.commit()
    return None
