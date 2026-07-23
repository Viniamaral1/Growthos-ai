import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.schemas.business_plan import BusinessPlanContent, BusinessPlanResponse
from app.services.business_plan_service import (
    BusinessPlanGenerationError,
    generate_business_plan,
)


router = APIRouter(
    prefix="/business-plans",
    tags=["AI Business Plans"],
)

DatabaseSession = Annotated[Session, Depends(get_db)]


def _response_from_company(company: Company) -> BusinessPlanResponse:
    if (
        company.business_plan_json is None
        or company.business_plan_model is None
        or company.business_plan_generated_at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This workspace does not have a generated business plan.",
        )

    try:
        plan = BusinessPlanContent.model_validate(
            json.loads(company.business_plan_json)
        )
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved business plan could not be read.",
        ) from error

    return BusinessPlanResponse(
        company_id=company.id,
        company_name=company.name,
        model=company.business_plan_model,
        generated_at=company.business_plan_generated_at,
        plan=plan,
    )


@router.get(
    "/{company_id}",
    response_model=BusinessPlanResponse,
)
def get_business_plan(
    company_id: int,
    database: DatabaseSession,
) -> BusinessPlanResponse:
    company = database.get(Company, company_id)

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    return _response_from_company(company)


@router.post(
    "/{company_id}/generate",
    response_model=BusinessPlanResponse,
)
def create_business_plan(
    company_id: int,
    database: DatabaseSession,
) -> BusinessPlanResponse:
    company = database.get(Company, company_id)

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    required_values = [
        company.business_idea,
        company.problem_statement,
        company.proposed_solution,
        company.country,
        company.business_model,
        company.primary_goal,
    ]

    if any(
        value is None or not str(value).strip()
        for value in required_values
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Complete the workspace idea, problem, solution, country, "
                "business model, and primary goal before generating a plan."
            ),
        )

    try:
        plan, model_name, generated_at = generate_business_plan(company)
    except BusinessPlanGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error

    company.business_plan_json = json.dumps(
        plan.model_dump(),
        ensure_ascii=False,
    )
    company.business_plan_model = model_name
    company.business_plan_generated_at = generated_at

    database.add(company)
    database.commit()
    database.refresh(company)

    return _response_from_company(company)
