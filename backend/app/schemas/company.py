from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class CompanyCreate(BaseModel):
    """
    Information required to create a company.
    """

    name: str = Field(
        min_length=2,
        max_length=100,
        examples=["Growth Labs"],
    )

    website: HttpUrl | None = Field(
        default=None,
        examples=["https://www.example.com"],
    )

    industry: str = Field(
        min_length=2,
        max_length=100,
        examples=["Artificial Intelligence"],
    )

    target_audience: str = Field(
        min_length=5,
        max_length=500,
        examples=[
            "Small UK businesses looking to automate marketing"
        ],
    )

    brand_tone: str = Field(
        min_length=2,
        max_length=100,
        examples=["Professional and approachable"],
    )

    product_description: str = Field(
        min_length=10,
        max_length=2000,
        examples=[
            "An AI platform that generates grounded marketing campaigns."
        ],
    )


class CompanyResponse(BaseModel):
    """
    Company information returned by the API.
    """

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
    created_at: datetime