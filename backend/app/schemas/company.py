from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
)


DevelopmentStage = Literal[
    "idea",
    "validation",
    "pre_launch",
    "launched",
    "growing",
    "established",
]


class CompanyCreate(BaseModel):
    """Information required to create a business workspace."""

    name: str = Field(
        min_length=2,
        max_length=100,
        examples=["SignBridge Accessibility"],
    )

    website: HttpUrl | None = Field(
        default=None,
        examples=["https://www.example.com"],
    )

    industry: str = Field(
        min_length=2,
        max_length=100,
        examples=["Accessibility Technology"],
    )

    target_audience: str = Field(
        min_length=5,
        max_length=1000,
        examples=[
            "Retailers, hospitals, restaurants, and public services "
            "that need accessible communication for Deaf customers."
        ],
    )

    brand_tone: str = Field(
        min_length=2,
        max_length=100,
        examples=["Professional, inclusive, and approachable"],
    )

    product_description: str = Field(
        min_length=10,
        max_length=3000,
        examples=[
            "A BSL accessibility platform supporting communication "
            "between organisations and Deaf customers."
        ],
    )

    business_idea: str | None = Field(
        default=None,
        max_length=3000,
    )

    problem_statement: str | None = Field(
        default=None,
        max_length=3000,
    )

    proposed_solution: str | None = Field(
        default=None,
        max_length=3000,
    )

    country: str | None = Field(
        default=None,
        max_length=100,
    )

    region: str | None = Field(
        default=None,
        max_length=150,
    )

    city: str | None = Field(
        default=None,
        max_length=150,
    )

    business_model: str | None = Field(
        default=None,
        max_length=150,
    )

    launch_budget: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=14,
        decimal_places=2,
    )

    budget_currency: str | None = Field(
        default=None,
        min_length=3,
        max_length=3,
        examples=["GBP"],
    )

    primary_goal: str | None = Field(
        default=None,
        max_length=150,
    )

    development_stage: DevelopmentStage | None = Field(
        default=None,
    )

    @field_validator(
        "business_idea",
        "problem_statement",
        "proposed_solution",
        "country",
        "region",
        "city",
        "business_model",
        "budget_currency",
        "primary_goal",
        mode="before",
    )
    @classmethod
    def convert_blank_strings_to_none(
        cls,
        value: object,
    ) -> object:
        if isinstance(value, str):
            stripped_value = value.strip()
            return stripped_value or None

        return value

    @field_validator("budget_currency")
    @classmethod
    def normalise_currency(
        cls,
        value: str | None,
    ) -> str | None:
        return value.upper() if value else None


class CompanyUpdate(BaseModel):
    """Editable business-workspace fields."""

    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )

    website: HttpUrl | None = None

    industry: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )

    target_audience: str | None = Field(
        default=None,
        min_length=5,
        max_length=1000,
    )

    brand_tone: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )

    product_description: str | None = Field(
        default=None,
        min_length=10,
        max_length=3000,
    )

    business_idea: str | None = Field(
        default=None,
        max_length=3000,
    )

    problem_statement: str | None = Field(
        default=None,
        max_length=3000,
    )

    proposed_solution: str | None = Field(
        default=None,
        max_length=3000,
    )

    country: str | None = Field(
        default=None,
        max_length=100,
    )

    region: str | None = Field(
        default=None,
        max_length=150,
    )

    city: str | None = Field(
        default=None,
        max_length=150,
    )

    business_model: str | None = Field(
        default=None,
        max_length=150,
    )

    launch_budget: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=14,
        decimal_places=2,
    )

    budget_currency: str | None = Field(
        default=None,
        min_length=3,
        max_length=3,
    )

    primary_goal: str | None = Field(
        default=None,
        max_length=150,
    )

    development_stage: DevelopmentStage | None = None

    @field_validator("budget_currency")
    @classmethod
    def normalise_currency(
        cls,
        value: str | None,
    ) -> str | None:
        return value.upper() if value else None


class CompanyResponse(BaseModel):
    """Complete business workspace returned by the API."""

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    name: str
    website: str | None
    industry: str
    target_audience: str
    brand_tone: str
    product_description: str

    business_idea: str | None
    problem_statement: str | None
    proposed_solution: str | None
    country: str | None
    region: str | None
    city: str | None
    business_model: str | None
    launch_budget: Decimal | None
    budget_currency: str | None
    primary_goal: str | None
    development_stage: DevelopmentStage | None

    created_at: datetime
    updated_at: datetime
