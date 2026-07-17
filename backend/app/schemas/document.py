from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    """
    Information returned for an uploaded document.
    """

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    company_id: int
    original_filename: str
    content_type: str
    file_size: int
    processing_status: str
    page_count: int | None
    character_count: int | None
    processing_error: str | None
    uploaded_at: datetime
    processed_at: datetime | None


class DocumentTextResponse(BaseModel):
    """
    Extracted text and processing information for one document.
    """

    id: int
    original_filename: str
    processing_status: str
    page_count: int | None
    character_count: int | None
    extracted_text: str | None