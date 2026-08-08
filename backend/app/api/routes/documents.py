import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.business_entity import (
    BusinessEntity,
    BusinessEntityExtraction,
    BusinessEntitySource,
)
from app.models.document import Document, DocumentProjectLink
from app.models.document_chunk import DocumentChunk
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.schemas.document import (
    DocumentResponse,
    DocumentTextResponse,
    DocumentRelevanceResponse,
    IntelligentIngestionResponse,
    DuplicateCheckResponse,
    DocumentRouteResponse,
    DocumentKnowledgeCaptureResponse,
)
from app.schemas.document_chunk import (
    DocumentChunkResponse,
)
from app.schemas.document_classification import (
    DocumentClassificationResponse,
)
from app.services.embedding_service import (
    EMBEDDING_MODEL_NAME,
    create_embeddings,
)
from app.services.extractors import (
    ExtractionError,
    UnsupportedFileTypeError,
    get_extractor,
)
from app.services.text_chunker import (
    create_document_chunks,
)
from app.services.document_classification_service import (
    classify_document,
)
from app.services.entity_extraction_service import map_document_entities
from app.services.document_relevance_service import assess_document_relevance
from app.services.intelligent_ingestion_service import assess_intelligent_ingestion


router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
)


DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


UPLOAD_DIRECTORY = Path("uploads")

UPLOAD_DIRECTORY.mkdir(
    parents=True,
    exist_ok=True,
)


MAX_FILE_SIZE = 10 * 1024 * 1024


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: str) -> str | None:
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return None


def _project_for_document(database: Session, document_id: int) -> tuple[int | None, str | None]:
    link = database.scalar(select(DocumentProjectLink).where(DocumentProjectLink.document_id == document_id))
    if link is None:
        return None, None
    space = database.get(KnowledgeSpace, link.space_id)
    return (link.space_id, space.name if space is not None else None)


def _document_response_with_project(database: Session, document: Document, state: BusinessEntityExtraction | None = None) -> DocumentResponse:
    response = _document_response(document, state)
    space_id, space_name = _project_for_document(database, document.id)
    return response.model_copy(update={"project_space_id": space_id, "project_space_name": space_name})


def _document_response(
    document: Document,
    state: BusinessEntityExtraction | None = None,
) -> DocumentResponse:
    """Return one document enriched with its per-file entity mapping state."""
    if document.processing_status != "processed":
        mapping_status = "unavailable"
    elif state is None:
        mapping_status = "not_mapped"
    else:
        mapping_status = state.status

    database = None
    # Project routing is attached by list/single endpoints when a database session is available.
    return DocumentResponse.model_validate(document).model_copy(
        update={
            "entity_mapping_status": mapping_status,
            "entity_count": state.entity_count if state is not None else 0,
            "entity_mapping_error": state.error if state is not None else None,
            "entity_mapped_at": state.processed_at if state is not None else None,
        }
    )



@router.post("/duplicate-check", response_model=DuplicateCheckResponse)
async def duplicate_check(
    company_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    database: DatabaseSession,
) -> DuplicateCheckResponse:
    if database.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    contents = await file.read()
    try:
        candidate_name = Path(file.filename or "").name
        candidate_hash = _sha256_bytes(contents)
        candidates = list(database.scalars(select(Document).where(Document.company_id == company_id).order_by(Document.uploaded_at.desc()).limit(250)).all())
        same_name = next((doc for doc in candidates if doc.original_filename.lower() == candidate_name.lower()), None)
        same_size_docs = [doc for doc in candidates if doc.file_size == len(contents)]
        exact = next((doc for doc in same_size_docs if _sha256_file(doc.file_path) == candidate_hash), None)
        existing = exact or same_name
        duplicate_type = "exact" if exact else "same_name" if same_name else "none"
        return DuplicateCheckResponse(
            duplicate_type=duplicate_type,
            existing_document_id=existing.id if existing else None,
            existing_filename=existing.original_filename if existing else None,
            exact_content_match=exact is not None,
            same_filename=same_name is not None,
            same_size=bool(exact or (same_name and same_name.file_size == len(contents))),
            message=(
                f"An exact copy already exists as {exact.original_filename}." if exact else
                f"A file named {same_name.original_filename} already exists." if same_name else
                "No duplicate detected."
            ),
        )
    finally:
        await file.close()


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    company_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    database: DatabaseSession,
) -> Document:
    """
    Upload and save a supported business asset.
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

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file must have a filename.",
        )

    file_contents = await file.read()

    if not file_contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if len(file_contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The file exceeds the maximum size of 10 MB.",
        )

    original_filename = Path(
        file.filename
    ).name

    file_extension = Path(
        original_filename
    ).suffix.lower()

    try:
        get_extractor(
            original_filename,
            file.content_type,
        )
    except UnsupportedFileTypeError as error:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(error),
        ) from error

    stored_filename = (
        f"{uuid4().hex}{file_extension}"
    )

    saved_file_path = (
        UPLOAD_DIRECTORY
        / stored_filename
    )

    try:
        saved_file_path.write_bytes(
            file_contents
        )

        document = Document(
            company_id=company_id,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=str(
                saved_file_path
            ),
            content_type=file.content_type,
            file_size=len(
                file_contents
            ),
            processing_status="uploaded",
        )

        database.add(
            document
        )
        database.commit()
        database.refresh(
            document
        )

        return document

    except OSError as error:
        database.rollback()

        if saved_file_path.exists():
            saved_file_path.unlink()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The document could not be saved.",
        ) from error

    except Exception:
        database.rollback()

        if saved_file_path.exists():
            saved_file_path.unlink()

        raise

    finally:
        await file.close()




@router.get(
    "/{document_id}/classification",
    response_model=DocumentClassificationResponse,
)
def get_document_classification(
    document_id: int,
    database: DatabaseSession,
) -> DocumentClassificationResponse:
    document = database.get(
        Document,
        document_id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    if document.processing_status != "processed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Process the document before classification."
            ),
        )

    return DocumentClassificationResponse.model_validate(
        classify_document(
            database,
            document,
        )
    )


@router.post(
    "/{document_id}/process",
    response_model=DocumentResponse,
)
def process_document(
    document_id: int,
    database: DatabaseSession,
) -> Document:
    """
    Extract, chunk and embed a supported business asset.
    """

    document = database.get(
        Document,
        document_id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    document.processing_status = "processing"
    document.processing_error = None
    database.commit()

    try:
        extractor = get_extractor(
            document.original_filename,
            document.content_type,
        )

        extraction_result = extractor.extract(
            document.file_path
        )

        generated_chunks = create_document_chunks(
            extracted_text=extraction_result.text,
            chunk_size=1000,
            overlap=200,
        )

        if not generated_chunks:
            raise ExtractionError(
                "No usable text chunks could be created."
            )

        chunk_embeddings = create_embeddings(
            chunk.text
            for chunk in generated_chunks
        )

        if len(chunk_embeddings) != len(
            generated_chunks
        ):
            raise RuntimeError(
                "The number of generated embeddings "
                "does not match the number of chunks."
            )

        database.execute(
            delete(
                DocumentChunk
            ).where(
                DocumentChunk.document_id
                == document.id
            )
        )

        for generated_chunk, embedding in zip(
            generated_chunks,
            chunk_embeddings,
            strict=True,
        ):
            database.add(
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=(
                        generated_chunk.chunk_index
                    ),
                    page_number=(
                        generated_chunk.page_number
                    ),
                    text=generated_chunk.text,
                    character_count=(
                        generated_chunk.character_count
                    ),
                    embedding_json=json.dumps(
                        embedding
                    ),
                    embedding_model=(
                        EMBEDDING_MODEL_NAME
                    ),
                )
            )

        document.extracted_text = (
            extraction_result.text
        )
        document.page_count = (
            extraction_result.page_count
        )
        document.character_count = (
            extraction_result.character_count
        )
        document.processing_status = "processed"
        document.processing_error = None
        document.processed_at = datetime.now(
            timezone.utc
        )

        database.commit()
        database.refresh(
            document
        )

        return document

    except (ExtractionError, UnsupportedFileTypeError) as error:
        database.rollback()

        document = database.get(
            Document,
            document_id,
        )

        if document is not None:
            document.processing_status = "failed"
            document.processing_error = str(
                error
            )
            document.processed_at = datetime.now(
                timezone.utc
            )
            database.commit()

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(
                error
            ),
        ) from error

    except Exception as error:
        database.rollback()

        document = database.get(
            Document,
            document_id,
        )

        if document is not None:
            document.processing_status = "failed"
            document.processing_error = (
                "An unexpected processing error occurred."
            )
            document.processed_at = datetime.now(
                timezone.utc
            )
            database.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "The document could not be embedded. "
                f"Reason: {error}"
            ),
        ) from error


@router.get(
    "",
    response_model=list[DocumentResponse],
)
def list_documents(
    database: DatabaseSession,
    company_id: int | None = None,
) -> list[DocumentResponse]:
    """
    Return uploaded documents.
    """

    statement = select(
        Document
    ).order_by(
        Document.uploaded_at.desc()
    )

    if company_id is not None:
        statement = statement.where(
            Document.company_id
            == company_id
        )

    documents = database.scalars(
        statement
    ).all()

    document_ids = [document.id for document in documents]
    states_by_document: dict[int, BusinessEntityExtraction] = {}
    if document_ids:
        states = database.scalars(
            select(BusinessEntityExtraction).where(
                BusinessEntityExtraction.source_kind == "document",
                BusinessEntityExtraction.source_id.in_(document_ids),
            )
        ).all()
        states_by_document = {state.source_id: state for state in states}

    return [
        _document_response_with_project(database, document, states_by_document.get(document.id))
        for document in documents
    ]


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
)
def get_document(
    document_id: int,
    database: DatabaseSession,
) -> DocumentResponse:
    """
    Return one document using its ID.
    """

    document = database.get(
        Document,
        document_id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    state = database.scalar(
        select(BusinessEntityExtraction).where(
            BusinessEntityExtraction.company_id == document.company_id,
            BusinessEntityExtraction.source_kind == "document",
            BusinessEntityExtraction.source_id == document.id,
        )
    )
    return _document_response_with_project(database, document, state)


@router.get(
    "/{document_id}/text",
    response_model=DocumentTextResponse,
)
def get_document_text(
    document_id: int,
    database: DatabaseSession,
) -> Document:
    """
    Return extracted text for a processed document.
    """

    document = database.get(
        Document,
        document_id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    if document.processing_status != "processed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Document text is not available because "
                "the document has not been processed successfully."
            ),
        )

    return document


@router.get(
    "/{document_id}/chunks",
    response_model=list[
        DocumentChunkResponse
    ],
)
def get_document_chunks(
    document_id: int,
    database: DatabaseSession,
) -> list[DocumentChunk]:
    """
    Return all chunks belonging to one document.
    """

    document = database.get(
        Document,
        document_id,
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    statement = (
        select(
            DocumentChunk
        )
        .where(
            DocumentChunk.document_id
            == document_id
        )
        .order_by(
            DocumentChunk.chunk_index
        )
    )

    chunks = database.scalars(
        statement
    ).all()

    return list(
        chunks
    )
@router.get(
    "/{document_id}/ingestion",
    response_model=IntelligentIngestionResponse,
)
def get_intelligent_ingestion(
    document_id: int,
    company_id: int,
    database: DatabaseSession,
    target_space_id: int | None = None,
) -> IntelligentIngestionResponse:
    """Understand one processed asset before it becomes long-term business memory."""
    try:
        return IntelligentIngestionResponse.model_validate(
            assess_intelligent_ingestion(database, company_id, document_id, target_space_id=target_space_id)
        )
    except ValueError as error:
        detail = str(error)
        status_code = (
            status.HTTP_409_CONFLICT
            if "Process the document" in detail
            else status.HTTP_404_NOT_FOUND
        )
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.get(
    "/{document_id}/relevance",
    response_model=DocumentRelevanceResponse,
)
def get_document_relevance(
    document_id: int,
    company_id: int,
    database: DatabaseSession,
    target_space_id: int | None = None,
) -> DocumentRelevanceResponse:
    """Check whether one processed asset belongs in the current workspace."""
    try:
        return DocumentRelevanceResponse.model_validate(
            assess_document_relevance(database, company_id, document_id, target_space_id=target_space_id)
        )
    except ValueError as error:
        detail = str(error)
        status_code = (
            status.HTTP_409_CONFLICT
            if "Process the document" in detail or "no extracted text" in detail
            else status.HTTP_404_NOT_FOUND
        )
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post(
    "/{document_id}/move",
    response_model=DocumentResponse,
)
def move_document_to_workspace(
    document_id: int,
    company_id: int,
    database: DatabaseSession,
) -> DocumentResponse:
    """Move an unmapped Business Intelligence asset to another workspace."""
    document = database.get(Document, document_id)
    destination = database.get(Company, company_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    if destination is None:
        raise HTTPException(status_code=404, detail="Destination workspace not found.")

    state = database.scalar(
        select(BusinessEntityExtraction).where(
            BusinessEntityExtraction.source_kind == "document",
            BusinessEntityExtraction.source_id == document.id,
        )
    )
    if state is not None and state.status in {"completed", "partial"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Move this asset before mapping its entities, or delete its entity map first.",
        )

    document.company_id = company_id
    database.add(document)
    database.commit()
    database.refresh(document)
    return _document_response_with_project(database, document, None)


@router.post("/{document_id}/route", response_model=DocumentRouteResponse)
def route_document_to_project(
    document_id: int,
    space_id: int,
    database: DatabaseSession,
) -> DocumentRouteResponse:
    document = database.get(Document, document_id)
    space = database.get(KnowledgeSpace, space_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    if space is None or space.company_id != document.company_id or space.is_archived:
        raise HTTPException(status_code=404, detail="Destination project not found.")
    link = database.scalar(select(DocumentProjectLink).where(DocumentProjectLink.document_id == document_id))
    if link is None:
        link = DocumentProjectLink(document_id=document_id, space_id=space_id)
    else:
        link.space_id = space_id
    database.add(link)
    database.commit()
    return DocumentRouteResponse(document_id=document_id, space_id=space.id, space_name=space.name, message=f"Asset routed to {space.name}.")


@router.post("/{document_id}/capture-knowledge", response_model=DocumentKnowledgeCaptureResponse)
def capture_document_knowledge(
    document_id: int,
    space_id: int,
    database: DatabaseSession,
) -> DocumentKnowledgeCaptureResponse:
    document = database.get(Document, document_id)
    space = database.get(KnowledgeSpace, space_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    if space is None or space.company_id != document.company_id or space.is_archived:
        raise HTTPException(status_code=404, detail="Knowledge project not found.")
    text = " ".join((document.extracted_text or "").split())
    if not text:
        raise HTTPException(status_code=409, detail="Process the document before capturing Knowledge.")
    existing = database.scalar(select(KnowledgeItem).where(
        KnowledgeItem.space_id == space_id,
        KnowledgeItem.title == document.original_filename,
        KnowledgeItem.content == text,
    ))
    if existing is not None:
        return DocumentKnowledgeCaptureResponse(document_id=document_id, space_id=space_id, knowledge_item_id=existing.id, title=existing.title, message="This document is already captured in Knowledge.")
    item = KnowledgeItem(
        company_id=document.company_id, space_id=space_id, item_type="document",
        title=document.original_filename, summary=text[:320], content=text, tags_json=json.dumps(["business-intelligence", "ingestion"]),
        source_conversation_id=None, source_message_id=None,
    )
    database.add(item)
    database.commit()
    database.refresh(item)
    return DocumentKnowledgeCaptureResponse(document_id=document_id, space_id=space_id, knowledge_item_id=item.id, title=item.title, message=f"Reusable knowledge captured in {space.name}.")


@router.post(
    "/{document_id}/entities/map",
)
def map_document_entities_from_library(
    document_id: int,
    company_id: int,
    database: DatabaseSession,
) -> dict[str, object]:
    """Map entities for one selected Business Intelligence asset only."""
    try:
        return map_document_entities(database, company_id, document_id)
    except ValueError as error:
        detail = str(error)
        status_code = (
            status.HTTP_409_CONFLICT
            if "Process the document" in detail or "no extracted text" in detail
            else status.HTTP_404_NOT_FOUND
        )
        raise HTTPException(status_code=status_code, detail=detail) from error
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(
    document_id: int,
    database: DatabaseSession,
) -> None:
    """Delete an uploaded asset, its chunks, and its stored file."""

    document = database.get(Document, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    file_path = Path(document.file_path)

    try:
        related_entity_ids = set(database.scalars(
            select(BusinessEntitySource.entity_id).where(
                BusinessEntitySource.company_id == document.company_id,
                BusinessEntitySource.source_kind == "document",
                BusinessEntitySource.source_id == document_id,
            )
        ).all())
        related_entity_ids.update(database.scalars(
            select(BusinessEntity.id).where(
                BusinessEntity.company_id == document.company_id,
                BusinessEntity.source_kind == "document",
                BusinessEntity.source_id == document_id,
            )
        ).all())

        database.execute(delete(BusinessEntitySource).where(
            BusinessEntitySource.company_id == document.company_id,
            BusinessEntitySource.source_kind == "document",
            BusinessEntitySource.source_id == document_id,
        ))
        database.execute(delete(BusinessEntityExtraction).where(
            BusinessEntityExtraction.company_id == document.company_id,
            BusinessEntityExtraction.source_kind == "document",
            BusinessEntityExtraction.source_id == document_id,
        ))
        database.flush()

        for entity_id in related_entity_ids:
            remaining_link = database.scalar(
                select(BusinessEntitySource.id).where(
                    BusinessEntitySource.entity_id == entity_id
                ).limit(1)
            )
            entity = database.get(BusinessEntity, entity_id)
            if entity is not None and remaining_link is None:
                database.delete(entity)

        database.execute(
            delete(DocumentChunk).where(
                DocumentChunk.document_id == document_id
            )
        )
        database.delete(document)
        database.commit()
    except Exception:
        database.rollback()
        raise

    try:
        if file_path.exists():
            file_path.unlink()
    except OSError:
        # The database deletion is authoritative; an orphaned local file can
        # be cleaned up separately without making the user-facing deletion fail.
        pass
