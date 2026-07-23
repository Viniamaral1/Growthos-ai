from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.schemas.company import (
    CompanyCreate,
    CompanyResponse,
    CompanyUpdate,
)


router = APIRouter(
    prefix="/companies",
    tags=["Business Workspaces"],
)


DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


@router.post(
    "",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_company(
    company_data: CompanyCreate,
    database: DatabaseSession,
) -> Company:
    """Create and save a complete business workspace."""

    company = Company(
        name=company_data.name,
        website=(
            str(company_data.website)
            if company_data.website
            else None
        ),
        industry=company_data.industry,
        target_audience=company_data.target_audience,
        brand_tone=company_data.brand_tone,
        product_description=company_data.product_description,
        business_idea=company_data.business_idea,
        problem_statement=company_data.problem_statement,
        proposed_solution=company_data.proposed_solution,
        country=company_data.country,
        region=company_data.region,
        city=company_data.city,
        business_model=company_data.business_model,
        launch_budget=company_data.launch_budget,
        budget_currency=company_data.budget_currency,
        primary_goal=company_data.primary_goal,
        development_stage=company_data.development_stage,
    )

    database.add(company)
    database.commit()
    database.refresh(company)

    return company


@router.get(
    "",
    response_model=list[CompanyResponse],
)
def list_companies(
    database: DatabaseSession,
) -> list[Company]:
    """Return all saved business workspaces."""

    statement = select(Company).order_by(
        Company.updated_at.desc(),
        Company.created_at.desc(),
    )

    companies = database.scalars(
        statement
    ).all()

    return list(companies)


@router.get(
    "/{company_id}",
    response_model=CompanyResponse,
)
def get_company(
    company_id: int,
    database: DatabaseSession,
) -> Company:
    """Return one business workspace by ID."""

    company = database.get(
        Company,
        company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    return company


@router.patch(
    "/{company_id}",
    response_model=CompanyResponse,
)
def update_company(
    company_id: int,
    company_data: CompanyUpdate,
    database: DatabaseSession,
) -> Company:
    """Update selected business-workspace fields."""

    company = database.get(
        Company,
        company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    update_values = company_data.model_dump(
        exclude_unset=True,
    )

    if "website" in update_values:
        website = update_values["website"]
        update_values["website"] = (
            str(website)
            if website
            else None
        )

    for field_name, value in update_values.items():
        setattr(
            company,
            field_name,
            value,
        )

    database.add(company)
    database.commit()
    database.refresh(company)

    return company
