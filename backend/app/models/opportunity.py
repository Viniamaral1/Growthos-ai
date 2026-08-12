from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class OpportunityRecord(Base):
    """Persisted user state for a deterministic GrowthOS opportunity finding."""

    __tablename__ = "opportunity_records"
    __table_args__ = (UniqueConstraint("company_id", "signature", name="uq_opportunity_company_signature"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    space_id: Mapped[int | None] = mapped_column(
        ForeignKey("knowledge_spaces.id", ondelete="SET NULL"), nullable=True, index=True
    )
    signature: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="detected", index=True)
    opportunity_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )


class OpportunityReviewState(Base):
    """Last completed opportunity review for one company/project scope."""

    __tablename__ = "opportunity_review_states"
    __table_args__ = (UniqueConstraint("company_id", "scope_key", name="uq_opportunity_review_scope"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scope_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    last_reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
