from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.marketing import (
    router as marketing_router,
)

from app.api.routes.answers import (
    router as answers_router,
)
from app.api.routes.companies import (
    router as companies_router,
)
from app.api.routes.documents import (
    router as documents_router,
)
from app.api.routes.health import (
    router as health_router,
)
from app.api.routes.search import (
    router as search_router,
)
from app.database.session import (
    Base,
    engine,
)
from app.models.company import Company
from app.models.document import Document
from app.models.document_chunk import (
    DocumentChunk,
)


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.
    """

    Base.metadata.create_all(
        bind=engine,
    )

    application = FastAPI(
        title="GrowthOS AI API",
        description=(
            "An AI platform that learns from company information "
            "and generates grounded marketing campaigns."
        ),
        version="0.6.0",
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

    return application


app = create_app()


@app.get("/")
def root() -> dict[str, str]:
    """
    Return basic API information.
    """

    return {
        "message": "Welcome to GrowthOS AI",
        "status": "running",
        "documentation": "/docs",
    }