from typing import Literal

from pydantic import BaseModel, Field


MarketingPlatform = Literal[
    "linkedin",
    "instagram",
    "facebook",
    "google_ads",
    "email",
]


MarketingObjective = Literal[
    "brand_awareness",
    "lead_generation",
    "product_launch",
    "sales",
    "engagement",
]


class MarketingContentRequest(BaseModel):
    """
    Information required to generate grounded marketing content.
    """

    company_id: int = Field(
        gt=0,
        examples=[1],
    )

    platform: MarketingPlatform

    objective: MarketingObjective

    campaign_brief: str = Field(
        min_length=5,
        max_length=1000,
        examples=[
            "Promote the company's AI document assistant to small UK businesses."
        ],
    )

    target_audience: str | None = Field(
        default=None,
        max_length=500,
    )

    tone: str | None = Field(
        default=None,
        max_length=100,
    )

    number_of_variants: int = Field(
        default=3,
        ge=1,
        le=5,
    )

    retrieval_limit: int = Field(
        default=6,
        ge=1,
        le=10,
    )

    minimum_score: float = Field(
        default=0.20,
        ge=-1.0,
        le=1.0,
    )


class MarketingSource(BaseModel):
    """
    Retrieved company-document evidence.
    """

    source_id: str
    document_name: str
    page_number: int | None
    similarity_score: float
    text: str


class MarketingVariant(BaseModel):
    """
    One generated marketing-content variant.
    """

    variant_number: int
    headline: str
    body: str
    call_to_action: str
    hashtags: list[str]
    citations: list[str]


class MarketingContentResponse(BaseModel):
    """
    Generated marketing content and supporting evidence.
    """

    company_id: int
    platform: MarketingPlatform
    objective: MarketingObjective
    model: str
    variants: list[MarketingVariant]
    sources: list[MarketingSource]