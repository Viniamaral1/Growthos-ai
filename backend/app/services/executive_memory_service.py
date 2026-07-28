from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.executive_memory import ExecutiveMemory
from app.services.embedding_service import (
    cosine_similarity_score,
    create_embeddings,
    create_query_embedding,
)


def memory_text(memory: ExecutiveMemory) -> str:
    return "\n".join(
        part
        for part in [
            memory.title,
            memory.summary,
            memory.details,
            memory.memory_type,
            memory.executive_role,
        ]
        if part
    )


def refresh_memory_embedding(
    memory: ExecutiveMemory,
) -> None:
    embeddings = create_embeddings(
        [memory_text(memory)]
    )
    memory.embedding_json = (
        json.dumps(embeddings[0])
        if embeddings
        else None
    )


def create_executive_memory(
    database: Session,
    *,
    company_id: int,
    executive_role: str,
    memory_type: str,
    title: str,
    summary: str,
    details: str | None,
    importance: int,
    source_conversation_id: int | None = None,
    source_message_id: int | None = None,
) -> ExecutiveMemory:
    memory = ExecutiveMemory(
        company_id=company_id,
        executive_role=executive_role,
        memory_type=memory_type,
        title=title.strip(),
        summary=summary.strip(),
        details=details.strip() if details else None,
        importance=importance,
        source_conversation_id=source_conversation_id,
        source_message_id=source_message_id,
    )
    refresh_memory_embedding(memory)
    database.add(memory)
    database.commit()
    database.refresh(memory)
    return memory


def retrieve_executive_memories(
    database: Session,
    *,
    company_id: int,
    executive_role: str,
    query: str,
    limit: int = 5,
) -> list[ExecutiveMemory]:
    statement = (
        select(ExecutiveMemory)
        .where(
            ExecutiveMemory.company_id == company_id,
            ExecutiveMemory.is_archived.is_(False),
        )
        .where(
            ExecutiveMemory.executive_role.in_(
                [executive_role, "board", "all"]
            )
        )
        .order_by(
            ExecutiveMemory.importance.desc(),
            ExecutiveMemory.updated_at.desc(),
        )
        .limit(80)
    )

    memories = list(
        database.scalars(statement).all()
    )

    if not memories:
        return []

    query_embedding = create_query_embedding(query)
    ranked: list[tuple[float, ExecutiveMemory]] = []

    for memory in memories:
        similarity = 0.0

        if memory.embedding_json:
            try:
                similarity = cosine_similarity_score(
                    query_embedding,
                    json.loads(memory.embedding_json),
                )
            except (
                json.JSONDecodeError,
                TypeError,
                ValueError,
            ):
                similarity = 0.0

        importance_weight = (
            max(1, min(memory.importance, 10))
            / 10
        )
        usage_weight = min(memory.times_used, 10) / 50

        score = (
            similarity * 0.72
            + importance_weight * 0.23
            + usage_weight * 0.05
        )
        ranked.append((score, memory))

    ranked.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    selected = [
        memory
        for score, memory in ranked[:limit]
        if score >= 0.18
    ]

    now = datetime.now(timezone.utc)
    for memory in selected:
        memory.times_used += 1
        memory.last_used_at = now
        database.add(memory)

    if selected:
        database.commit()

    return selected


def build_executive_memory(
    database: Session,
    *,
    company_id: int,
    executive_role: str,
    current_conversation_id: int | None,
    compact: bool,
    query: str = "",
) -> str:
    """Build a bounded, role-specific long-term memory block."""

    if compact:
        return "Long-term executive memory omitted for compact retry."

    cleaned_query = query.strip() or (
        "current strategic priorities decisions goals risks"
    )

    memories = retrieve_executive_memories(
        database,
        company_id=company_id,
        executive_role=executive_role,
        query=cleaned_query,
        limit=5,
    )

    if not memories:
        return (
            "No explicit long-term memories have been saved "
            "for this executive yet."
        )

    blocks: list[str] = []

    for index, memory in enumerate(
        memories,
        start=1,
    ):
        details = (
            f"\nDetails: {memory.details[:650]}"
            if memory.details
            else ""
        )
        blocks.append(
            "\n".join(
                [
                    f"[M{index}] {memory.title}",
                    (
                        f"Type: {memory.memory_type} | "
                        f"Importance: {memory.importance}/10"
                    ),
                    f"Memory: {memory.summary[:850]}",
                ]
            )
            + details
        )

    return "\n\n".join(blocks)
