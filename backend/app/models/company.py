from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class Company(Base):
    """
    Database table containing company profiles.
    """

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    website: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    industry: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    target_audience: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    brand_tone: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    product_description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )