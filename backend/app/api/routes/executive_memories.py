from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.executive_memory import ExecutiveMemory
from app.schemas.executive_memory import (
    ExecutiveMemoryCreate,
    ExecutiveMemoryResponse,
    ExecutiveMemoryUpdate,
)
from app.services.executive_memory_service import (
    create_executive_memory,
    refresh_memory_embedding,
)


router = APIRouter(
    prefix="/executive-memories",
    tags=["Executive Memory"],
)

DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


@router.get(
    "",
    response_model=list[ExecutiveMemoryResponse],
)
def list_executive_memories(
    company_id: int,
    database: DatabaseSession,
    executive_role: str | None = None,
    memory_type: str | None = None,
    include_archived: bool = False,
    search: str | None = Query(default=None, max_length=200),
) -> list[ExecutiveMemory]:
    if database.get(Company, company_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    statement = (
        select(ExecutiveMemory)
        .where(
            ExecutiveMemory.company_id == company_id
        )
        .order_by(
            ExecutiveMemory.importance.desc(),
            ExecutiveMemory.updated_at.desc(),
        )
    )

    if not include_archived:
        statement = statement.where(
            ExecutiveMemory.is_archived.is_(False)
        )

    if executive_role:
        statement = statement.where(
            ExecutiveMemory.executive_role
            == executive_role
        )

    if memory_type:
        statement = statement.where(
            ExecutiveMemory.memory_type
            == memory_type
        )

    memories = list(
        database.scalars(statement).all()
    )

    if search and search.strip():
        needle = search.strip().lower()
        memories = [
            memory
            for memory in memories
            if needle in (
                f"{memory.title} {memory.summary} "
                f"{memory.details or ''}"
            ).lower()
        ]

    return memories


@router.post(
    "",
    response_model=ExecutiveMemoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_memory(
    payload: ExecutiveMemoryCreate,
    database: DatabaseSession,
) -> ExecutiveMemory:
    if database.get(Company, payload.company_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    return create_executive_memory(
        database,
        **payload.model_dump(),
    )


@router.patch(
    "/{memory_id}",
    response_model=ExecutiveMemoryResponse,
)
def update_memory(
    memory_id: int,
    payload: ExecutiveMemoryUpdate,
    database: DatabaseSession,
) -> ExecutiveMemory:
    memory = database.get(
        ExecutiveMemory,
        memory_id,
    )

    if memory is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Executive memory not found.",
        )

    updates = payload.model_dump(
        exclude_unset=True
    )

    embedding_fields = {
        "executive_role",
        "memory_type",
        "title",
        "summary",
        "details",
    }

    for field, value in updates.items():
        setattr(memory, field, value)

    if embedding_fields.intersection(updates):
        refresh_memory_embedding(memory)

    database.add(memory)
    database.commit()
    database.refresh(memory)
    return memory


@router.delete(
    "/{memory_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_memory(
    memory_id: int,
    database: DatabaseSession,
) -> None:
    memory = database.get(
        ExecutiveMemory,
        memory_id,
    )

    if memory is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Executive memory not found.",
        )

    database.delete(memory)
    database.commit()
