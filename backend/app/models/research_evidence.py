from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class ResearchEvidence(Base):
    """A manual or document-backed evidence record linked to a research task."""

    __tablename__ = "research_evidence"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    research_task_id: Mapped[int] = mapped_column(
        ForeignKey(
            "research_tasks.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    document_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "documents.id",
            ondelete="SET NULL",
        ),
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

    evidence_type: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="manual",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
