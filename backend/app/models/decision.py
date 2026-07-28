from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class Decision(Base):
    """A saved executive recommendation with an explicit workflow."""

    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    conversation_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL"),
        nullable=True,
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
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="proposed",
        index=True,
    )
    owner_role: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
        index=True,
    )
    source_executive_role: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )
    confidence_level: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    confidence_score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    handoff_note: Mapped[str | None] = mapped_column(
        Text,
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
