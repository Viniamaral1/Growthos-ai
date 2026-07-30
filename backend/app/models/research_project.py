from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class ResearchProject(Base):
    """A persistent, topic-agnostic guided research engagement."""

    __tablename__ = "research_projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="discovery", index=True
    )
    project_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    deliverable_type: Mapped[str] = mapped_column(
        String(60), nullable=False, default="research_report"
    )
    questions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    answers_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    plan_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    assumptions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    model: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
