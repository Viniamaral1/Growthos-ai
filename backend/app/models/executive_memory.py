from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class ExecutiveMemory(Base):
    """One explicitly saved long-term memory for an executive."""

    __tablename__ = "executive_memories"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    executive_role: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        index=True,
    )
    memory_type: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="fact",
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    details: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    importance: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
        index=True,
    )
    source_conversation_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    embedding_json: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
    )
    times_used: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
