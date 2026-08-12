from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.answers import (
    router as answers_router,
)
from app.api.routes.companies import (
    router as companies_router,
)
from app.api.routes.business_plans import (
    router as business_plans_router,
)
from app.api.routes.business_graph import (
    router as business_graph_router,
)
from app.api.routes.conversations import (
    router as conversations_router,
)
from app.api.routes.decisions import (
    router as decisions_router,
)
from app.api.routes.documents import (
    router as documents_router,
)
from app.api.routes.health import (
    router as health_router,
)
from app.api.routes.executive_memories import (
    router as executive_memories_router,
)
from app.api.routes.knowledge_spaces import (
    router as knowledge_spaces_router,
)
from app.api.routes.marketing import (
    router as marketing_router,
)
from app.api.routes.opportunities import (
    router as opportunities_router,
)
from app.api.routes.research import (
    router as research_router,
)
from app.api.routes.research_projects import (
    router as research_projects_router,
)
from app.api.routes.response_feedback import (
    router as response_feedback_router,
)
from app.api.routes.search import (
    router as search_router,
)
from app.database.session import (
    Base,
    engine,
)
from app.database.workspace_migration import (
    migrate_company_to_workspace,
    migrate_research_chat_integration,
)
from app.models.company import Company
from app.models.decision import Decision
from app.models.document import Document
from app.models.document_chunk import (
    DocumentChunk,
)
from app.models.conversation import Conversation
from app.models.chat_message import ChatMessage
from app.models.research_task import ResearchTask
from app.models.research_project import ResearchProject
from app.models.research_evidence import ResearchEvidence
from app.models.response_feedback import ResponseFeedback
from app.models.executive_memory import ExecutiveMemory
from app.models.knowledge_space import KnowledgeSpace
from app.models.knowledge_item import KnowledgeItem
from app.models.business_entity import BusinessEntity
from app.models.opportunity import OpportunityRecord, OpportunityReviewState


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    # Create missing tables first, then add the new nullable workspace
    # columns to existing SQLite installations.
    Base.metadata.create_all(
        bind=engine,
    )

    migrate_company_to_workspace(
        engine
    )
    migrate_research_chat_integration(engine)

    application = FastAPI(
        title="GrowthOS AI API",
        description=(
            "An AI Business Co-Founder platform combining "
            "business workspaces, company knowledge, grounded "
            "answers, and evidence-based marketing."
        ),
        version="5.2.0",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(
        health_router,
        prefix="/api/v1",
    )

    application.include_router(
        companies_router,
        prefix="/api/v1",
    )

    application.include_router(
        business_plans_router,
        prefix="/api/v1",
    )

    application.include_router(
        business_graph_router,
        prefix="/api/v1",
    )

    application.include_router(
        conversations_router,
        prefix="/api/v1",
    )

    application.include_router(
        decisions_router,
        prefix="/api/v1",
    )

    application.include_router(
        documents_router,
        prefix="/api/v1",
    )

    application.include_router(
        search_router,
        prefix="/api/v1",
    )

    application.include_router(
        answers_router,
        prefix="/api/v1",
    )

    application.include_router(
        marketing_router,
        prefix="/api/v1",
    )

    application.include_router(
        opportunities_router,
        prefix="/api/v1",
    )

    application.include_router(
        research_router,
        prefix="/api/v1",
    )

    application.include_router(
        research_projects_router,
        prefix="/api/v1",
    )

    application.include_router(
        response_feedback_router,
        prefix="/api/v1",
    )

    application.include_router(
        executive_memories_router,
        prefix="/api/v1",
    )

    application.include_router(
        knowledge_spaces_router,
        prefix="/api/v1",
    )

    return application


app = create_app()


@app.get("/")
def root() -> dict[str, str]:
    """Return basic API information."""

    return {
        "message": "Welcome to GrowthOS AI",
        "status": "running",
        "version": "3.4.0",
        "documentation": "/docs",
    }
