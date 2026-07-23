import json
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
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.schemas.document import (
    DocumentResponse,
    DocumentTextResponse,
)
from app.schemas.document_chunk import (
    DocumentChunkResponse,
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
) -> list[Document]:
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

    return list(
        documents
    )


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
)
def get_document(
    document_id: int,
    database: DatabaseSession,
) -> Document:
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

    return document


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