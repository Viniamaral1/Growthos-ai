from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyResponse


router = APIRouter(
    prefix="/companies",
    tags=["Companies"],
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
    """
    Create and save a company profile.
    """

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
    """
    Return all saved companies.
    """

    statement = select(Company).order_by(
        Company.created_at.desc()
    )

    companies = database.scalars(statement).all()

    return list(companies)


@router.get(
    "/{company_id}",
    response_model=CompanyResponse,
)
def get_company(
    company_id: int,
    database: DatabaseSession,
) -> Company:
    """
    Return one company by ID.
    """

    company = database.get(
        Company,
        company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    return company