from __future__ import annotations

import json
import re
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



MEMORY_SIGNAL_PATTERNS: dict[str, tuple[str, ...]] = {
    "decision": ("we decided", "we have decided", "decision is", "we will", "approved", "agreed to"),
    "goal": ("our goal", "primary goal", "priority is", "we need to", "we must", "target is", "objective is"),
    "preference": ("we prefer", "i prefer", "always use", "do not use", "our preference"),
    "risk": ("risk is", "main risk", "avoid", "must not", "constraint", "limit is", "budget cap"),
    "customer": ("target customer", "target audience", "ideal customer", "customer needs"),
    "competitor": ("competitor", "competing with", "differentiate from"),
    "strategy": ("strategy is", "focus on", "positioning", "go to market", "market entry", "validate first"),
    "task": ("next action", "owner is", "deadline", "follow up"),
}


def _normalise_memory_text(value: str) -> str:
    return " ".join(value.replace("\n", " ").split()).strip()


def _detect_memory_type(text: str) -> str | None:
    # Prefer the durable subject of the statement over the verb used
    # to introduce it. For example, "we decided our primary goal..."
    # is a goal memory, not merely a historical decision.
    precedence = (
        "goal",
        "risk",
        "preference",
        "customer",
        "competitor",
        "strategy",
        "task",
        "decision",
    )
    scores = {
        memory_type: sum(
            1 for signal in MEMORY_SIGNAL_PATTERNS[memory_type]
            if signal in text
        )
        for memory_type in precedence
    }
    strongest = max(scores.values(), default=0)
    if strongest <= 0:
        return None

    for memory_type in precedence:
        if scores[memory_type] == strongest:
            return memory_type
    return None


def _proposal_title(summary: str, memory_type: str) -> str:
    cleaned = re.sub(r"^(we|our|i)\s+", "", summary, flags=re.IGNORECASE)
    words = cleaned.split()
    if len(words) > 9:
        cleaned = " ".join(words[:9]) + "…"
    return cleaned[:180].strip(" .,:;-") or f"New {memory_type}"


def _proposal_importance(text: str, memory_type: str) -> int:
    score = 7 if memory_type in {"decision", "goal", "risk", "strategy"} else 5
    if any(signal in text for signal in (
        "must", "primary", "critical", "always", "never",
        "approved", "decided", "priority",
    )):
        score += 1
    return min(score, 10)


def _find_duplicate_memory(
    database: Session,
    *,
    company_id: int,
    executive_role: str,
    proposed_text: str,
    threshold: float = 0.88,
) -> ExecutiveMemory | None:
    memories = list(
        database.scalars(
            select(ExecutiveMemory)
            .where(
                ExecutiveMemory.company_id == company_id,
                ExecutiveMemory.is_archived.is_(False),
            )
            .where(
                ExecutiveMemory.executive_role.in_([executive_role, "board", "all"])
            )
            .limit(120)
        ).all()
    )
    if not memories:
        return None

    query_embedding = create_query_embedding(proposed_text)
    strongest: tuple[float, ExecutiveMemory] | None = None

    for memory in memories:
        if not memory.embedding_json:
            continue
        try:
            score = cosine_similarity_score(
                query_embedding,
                json.loads(memory.embedding_json),
            )
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        if strongest is None or score > strongest[0]:
            strongest = (score, memory)

    return (
        strongest[1]
        if strongest is not None and strongest[0] >= threshold
        else None
    )


def propose_memory_from_exchange(
    database: Session,
    *,
    company_id: int,
    executive_role: str,
    user_message: str,
    assistant_message: str,
    conversation_id: int,
    message_id: int,
) -> dict[str, object] | None:
    """Suggest one durable memory. Nothing is saved without approval."""

    user_text = _normalise_memory_text(user_message)
    if len(user_text) < 12:
        return None

    lowered = user_text.lower()
    memory_type = _detect_memory_type(lowered)
    if memory_type is None:
        return None

    if user_text.endswith("?") and not any(signal in lowered for signal in (
        "we decided", "we will", "our goal", "priority is",
        "we prefer", "we must", "strategy is", "risk is",
    )):
        return None

    summary = user_text[:1200]
    if _find_duplicate_memory(
        database,
        company_id=company_id,
        executive_role=executive_role,
        proposed_text=summary,
    ) is not None:
        return None

    context = _normalise_memory_text(assistant_message)[:700]
    return {
        "executive_role": executive_role,
        "memory_type": memory_type,
        "title": _proposal_title(summary, memory_type),
        "summary": summary,
        "details": f"GrowthOS response context: {context}" if context else None,
        "importance": _proposal_importance(lowered, memory_type),
        "source_conversation_id": conversation_id,
        "source_message_id": message_id,
        "reason": (
            f"The message contains a durable {memory_type} that may be useful "
            "in future executive conversations."
        ),
    }
