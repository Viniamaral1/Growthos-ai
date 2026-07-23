import json
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from pydantic import ValidationError

from app.models.company import Company
from app.schemas.business_plan import BusinessPlanContent
from app.services.answer_service import get_ollama_base_url, get_ollama_model


class BusinessPlanGenerationError(Exception):
    """Raised when a structured business plan cannot be generated."""


def _text(value: object) -> str:
    if value is None:
        return "Not provided"

    if isinstance(value, Decimal):
        return format(value, "f")

    return str(value).strip() or "Not provided"


def _workspace_profile(company: Company) -> str:
    location = ", ".join(
        value
        for value in [company.city, company.region, company.country]
        if value
    ) or "Not provided"

    budget = "Not provided"
    if company.launch_budget is not None:
        budget = (
            f"{company.budget_currency or ''} "
            f"{_text(company.launch_budget)}"
        ).strip()

    return "\n".join(
        [
            f"Workspace name: {_text(company.name)}",
            f"Industry: {_text(company.industry)}",
            f"Development stage: {_text(company.development_stage)}",
            f"Business idea: {_text(company.business_idea)}",
            f"Problem statement: {_text(company.problem_statement)}",
            f"Proposed solution: {_text(company.proposed_solution)}",
            f"Product or service: {_text(company.product_description)}",
            f"Target audience: {_text(company.target_audience)}",
            f"Target location: {location}",
            f"Business model: {_text(company.business_model)}",
            f"Launch budget: {budget}",
            f"Primary goal: {_text(company.primary_goal)}",
            f"Brand tone: {_text(company.brand_tone)}",
            f"Website: {_text(company.website)}",
        ]
    )


def generate_business_plan(
    company: Company,
) -> tuple[BusinessPlanContent, str, datetime]:
    """Generate a structured plan from the saved workspace profile."""

    model_name = get_ollama_model()

    system_message = """
You are GrowthOS AI, an AI business co-founder.

Create a practical early-stage business plan using only the workspace
information supplied by the user.

Rules:
1. Do not invent market sizes, demographic counts, competitor names,
   legal requirements, funding amounts, prices, or performance statistics.
2. When evidence is missing, state a hypothesis, assumption, or research task.
3. Keep recommendations specific to the stated industry, audience, location,
   budget, development stage, and primary goal.
4. Produce concise, actionable content suitable for a founder.
5. Return valid JSON matching the provided schema with no markdown fences.
""".strip()

    user_message = f"""
Create the first GrowthOS business plan for this workspace.

WORKSPACE PROFILE
{_workspace_profile(company)}

Include an executive summary, opportunity, target market, customer segments,
value proposition, business-model recommendations, go-to-market strategy,
marketing strategy, SWOT analysis, risks, research priorities, a realistic
90-day roadmap, immediate actions, and assumptions.

Do not claim that external market research has already been completed.
""".strip()

    request_body = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        "stream": False,
        "think": False,
        "keep_alive": "10m",
        "format": BusinessPlanContent.model_json_schema(),
        "options": {
            "temperature": 0.25,
            "num_predict": 1800,
            "num_ctx": 8192,
        },
    }

    try:
        response = httpx.post(
            f"{get_ollama_base_url()}/api/chat",
            json=request_body,
            timeout=httpx.Timeout(
                connect=10.0,
                read=600.0,
                write=30.0,
                pool=10.0,
            ),
        )
        response.raise_for_status()

        response_data = response.json()
        raw_content = str(
            response_data.get("message", {}).get("content", "")
        ).strip()

        if not raw_content:
            raise BusinessPlanGenerationError(
                "Ollama returned an empty business plan."
            )

        try:
            raw_plan = json.loads(raw_content)
            plan = BusinessPlanContent.model_validate(raw_plan)
        except (json.JSONDecodeError, ValidationError) as error:
            raise BusinessPlanGenerationError(
                "Ollama returned a business plan in an invalid structure."
            ) from error

        return plan, model_name, datetime.now(timezone.utc)

    except httpx.ConnectError as error:
        raise BusinessPlanGenerationError(
            "GrowthOS could not connect to Ollama. "
            "Make sure Ollama is installed and running."
        ) from error
    except httpx.TimeoutException as error:
        raise BusinessPlanGenerationError(
            "The local model took too long to generate the business plan."
        ) from error
    except httpx.HTTPStatusError as error:
        detail = error.response.text[:300]
        raise BusinessPlanGenerationError(
            "Ollama returned an HTTP error "
            f"{error.response.status_code}: {detail}"
        ) from error
    except ValueError as error:
        raise BusinessPlanGenerationError(
            "Ollama returned invalid response data."
        ) from error
