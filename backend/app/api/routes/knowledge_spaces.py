import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.schemas.knowledge import (
    KnowledgeItemCreate,
    KnowledgeItemResponse,
    KnowledgeSpaceCreate,
    KnowledgeSpaceResponse,
    KnowledgeSpaceSummary,
    KnowledgeSpaceUpdate,
)

router = APIRouter(prefix="/knowledge-spaces", tags=["Knowledge Spaces"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def require_company(database: Session, company_id: int) -> None:
    if database.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")


@router.get("", response_model=list[KnowledgeSpaceResponse])
def list_spaces(company_id: int, database: DatabaseSession, include_archived: bool = False):
    require_company(database, company_id)
    statement = select(KnowledgeSpace).where(KnowledgeSpace.company_id == company_id)
    if not include_archived:
        statement = statement.where(KnowledgeSpace.is_archived.is_(False))
    return list(database.scalars(statement.order_by(KnowledgeSpace.updated_at.desc())).all())


@router.post("", response_model=KnowledgeSpaceResponse, status_code=status.HTTP_201_CREATED)
def create_space(payload: KnowledgeSpaceCreate, database: DatabaseSession):
    require_company(database, payload.company_id)
    duplicate = database.scalar(
        select(KnowledgeSpace).where(
            KnowledgeSpace.company_id == payload.company_id,
            func.lower(KnowledgeSpace.name) == payload.name.strip().lower(),
            KnowledgeSpace.is_archived.is_(False),
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A knowledge space with this name already exists.")
    space = KnowledgeSpace(**payload.model_dump())
    space.name = space.name.strip()
    database.add(space)
    database.commit()
    database.refresh(space)
    return space


@router.patch("/{space_id}", response_model=KnowledgeSpaceResponse)
def update_space(space_id: int, payload: KnowledgeSpaceUpdate, database: DatabaseSession):
    space = database.get(KnowledgeSpace, space_id)
    if space is None:
        raise HTTPException(status_code=404, detail="Knowledge space not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(space, field, value.strip() if isinstance(value, str) else value)
    database.add(space)
    database.commit()
    database.refresh(space)
    return space


@router.post("/{space_id}/items", response_model=KnowledgeItemResponse, status_code=status.HTTP_201_CREATED)
def capture_item(space_id: int, payload: KnowledgeItemCreate, database: DatabaseSession):
    space = database.get(KnowledgeSpace, space_id)
    if space is None or space.company_id != payload.company_id:
        raise HTTPException(status_code=404, detail="Knowledge space not found.")
    item = KnowledgeItem(
        company_id=payload.company_id,
        space_id=space_id,
        item_type=payload.item_type,
        title=payload.title.strip(),
        summary=payload.summary.strip(),
        content=payload.content.strip(),
        tags_json=json.dumps([tag.strip() for tag in payload.tags if tag.strip()]),
        source_conversation_id=payload.source_conversation_id,
        source_message_id=payload.source_message_id,
    )
    database.add(item)
    database.add(space)
    database.commit()
    database.refresh(item)
    return item


@router.get("/{space_id}/items", response_model=list[KnowledgeItemResponse])
def list_items(space_id: int, database: DatabaseSession, search: str | None = Query(default=None, max_length=200)):
    space = database.get(KnowledgeSpace, space_id)
    if space is None:
        raise HTTPException(status_code=404, detail="Knowledge space not found.")
    statement = select(KnowledgeItem).where(KnowledgeItem.space_id == space_id)
    if search and search.strip():
        needle = f"%{search.strip()}%"
        statement = statement.where(or_(
            KnowledgeItem.title.ilike(needle),
            KnowledgeItem.summary.ilike(needle),
            KnowledgeItem.content.ilike(needle),
            KnowledgeItem.tags_json.ilike(needle),
        ))
    return list(database.scalars(statement.order_by(KnowledgeItem.created_at.desc())).all())


@router.get("/{space_id}/summary", response_model=KnowledgeSpaceSummary)
def summarize_space(space_id: int, database: DatabaseSession):
    space = database.get(KnowledgeSpace, space_id)
    if space is None:
        raise HTTPException(status_code=404, detail="Knowledge space not found.")
    items = list(database.scalars(
        select(KnowledgeItem).where(KnowledgeItem.space_id == space_id).order_by(KnowledgeItem.created_at.desc())
    ).all())
    counts: dict[str, int] = {}
    for item in items:
        counts[item.item_type] = counts.get(item.item_type, 0) + 1
    highlights = [f"• {item.title}: {item.summary[:220]}" for item in items[:12]]
    summary = "No knowledge has been captured yet." if not highlights else "\n".join(highlights)
    return KnowledgeSpaceSummary(
        space=space,
        total_items=len(items),
        counts_by_type=counts,
        summary=summary,
        open_questions=[],
    )
