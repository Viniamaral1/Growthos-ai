from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat_message import ChatMessage
from app.models.conversation import Conversation


def build_executive_memory(
    database: Session,
    *,
    company_id: int,
    executive_role: str,
    current_conversation_id: int | None,
    compact: bool,
) -> str:
    """
    Return a small role-specific memory block.

    Memory is sourced from saved assistant messages produced by the
    same executive. It is deliberately bounded for local models.
    """

    message_limit = 2 if compact else 4
    character_limit = 420 if compact else 760

    if not hasattr(ChatMessage, "executive_role"):
        return "Executive memory is unavailable until the backend reloads."

    statement = (
        select(ChatMessage, Conversation.title)
        .join(
            Conversation,
            ChatMessage.conversation_id == Conversation.id,
        )
        .where(
            Conversation.company_id == company_id,
            ChatMessage.role == "assistant",
            ChatMessage.executive_role == executive_role,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(message_limit)
    )

    if current_conversation_id is not None:
        statement = statement.where(
            ChatMessage.conversation_id
            != current_conversation_id
        )

    rows = database.execute(statement).all()

    if not rows:
        return (
            "No saved memory is available yet for this executive."
        )

    blocks: list[str] = []

    for message, conversation_title in rows:
        content = " ".join(
            message.content.split()
        )[:character_limit]

        blocks.append(
            f"Conversation: {conversation_title}\n"
            f"Previous recommendation: {content}"
        )

    return "\n\n".join(blocks)
