import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.research_project import ResearchProject
from app.schemas.research_project import (
    ResearchAnswerUpdate,
    ResearchProjectCreate,
    ResearchProjectResponse,
    ResearchQuestion,
    ResearchPlanContent,
)
from app.services.research_project_service import (
    ResearchProjectGenerationError,
    create_discovery,
    create_plan,
)

router = APIRouter(prefix="/research-projects", tags=["Research Projects"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def _loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _response(project: ResearchProject) -> ResearchProjectResponse:
    questions = [
        ResearchQuestion.model_validate(item)
        for item in _loads(project.questions_json, [])
    ]
    raw_plan = _loads(project.plan_json, None)
    plan = ResearchPlanContent.model_validate(raw_plan) if raw_plan else None
    return ResearchProjectResponse(
        id=project.id,
        company_id=project.company_id,
        title=project.title,
        goal=project.goal,
        context=project.context,
        status=project.status,
        project_type=project.project_type,
        deliverable_type=project.deliverable_type,
        questions=questions,
        answers=_loads(project.answers_json, {}),
        plan=plan,
        assumptions=_loads(project.assumptions_json, []),
        model=project.model,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _get_project(database: Session, project_id: int) -> ResearchProject:
    project = database.get(ResearchProject, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Research project not found.")
    return project


@router.get("/company/{company_id}", response_model=list[ResearchProjectResponse])
def list_projects(company_id: int, database: DatabaseSession):
    if database.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Business workspace not found.")
    projects = database.scalars(
        select(ResearchProject)
        .where(ResearchProject.company_id == company_id)
        .order_by(ResearchProject.updated_at.desc(), ResearchProject.id.desc())
    ).all()
    return [_response(project) for project in projects]


@router.post(
    "/company/{company_id}",
    response_model=ResearchProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(company_id: int, payload: ResearchProjectCreate, database: DatabaseSession):
    company = database.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Business workspace not found.")
    try:
        discovery, model = create_discovery(company, payload.goal.strip(), payload.context)
    except ResearchProjectGenerationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    project = ResearchProject(
        company_id=company_id,
        title=discovery.title,
        goal=payload.goal.strip(),
        context=payload.context.strip() if payload.context else None,
        status="ready" if not discovery.questions else "discovery",
        project_type=discovery.project_type,
        deliverable_type=payload.deliverable_type,
        questions_json=json.dumps(
            [question.model_dump() for question in discovery.questions],
            ensure_ascii=False,
        ),
        answers_json="{}",
        assumptions_json=json.dumps(discovery.assumptions, ensure_ascii=False),
        model=model,
    )
    database.add(project)
    database.commit()
    database.refresh(project)
    return _response(project)


@router.get("/{project_id}", response_model=ResearchProjectResponse)
def get_project(project_id: int, database: DatabaseSession):
    return _response(_get_project(database, project_id))


@router.patch("/{project_id}/answers", response_model=ResearchProjectResponse)
def update_answers(project_id: int, payload: ResearchAnswerUpdate, database: DatabaseSession):
    project = _get_project(database, project_id)
    valid_ids = {
        str(item.get("id", "")) for item in _loads(project.questions_json, [])
    }
    cleaned = {
        key: value.strip()
        for key, value in payload.answers.items()
        if key in valid_ids and value.strip()
    }
    existing = _loads(project.answers_json, {})
    existing.update(cleaned)
    project.answers_json = json.dumps(existing, ensure_ascii=False)

    required_ids = {
        str(item.get("id", ""))
        for item in _loads(project.questions_json, [])
        if item.get("required", True)
    }
    project.status = "ready" if required_ids.issubset(
        {key for key, value in existing.items() if str(value).strip()}
    ) else "discovery"
    database.commit()
    database.refresh(project)
    return _response(project)


@router.post("/{project_id}/plan", response_model=ResearchProjectResponse)
def generate_plan(project_id: int, database: DatabaseSession):
    project = _get_project(database, project_id)
    company = database.get(Company, project.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Business workspace not found.")

    questions = _loads(project.questions_json, [])
    answers = _loads(project.answers_json, {})
    missing = [
        item.get("question", "Required question")
        for item in questions
        if item.get("required", True) and not str(answers.get(str(item.get("id", "")), "")).strip()
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail="Answer the required discovery questions before generating the plan.",
        )

    try:
        plan, model = create_plan(
            company=company,
            goal=project.goal,
            context=project.context,
            project_type=project.project_type,
            questions=questions,
            answers=answers,
            assumptions=_loads(project.assumptions_json, []),
            deliverable_type=project.deliverable_type,
        )
    except ResearchProjectGenerationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    project.plan_json = json.dumps(plan.model_dump(), ensure_ascii=False)
    project.assumptions_json = json.dumps(plan.assumptions, ensure_ascii=False)
    project.status = "planned"
    project.model = model
    database.commit()
    database.refresh(project)
    return _response(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, database: DatabaseSession):
    project = _get_project(database, project_id)
    database.delete(project)
    database.commit()
