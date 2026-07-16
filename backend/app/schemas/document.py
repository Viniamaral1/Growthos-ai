from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    """
    Information returned after a document is uploaded.
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
    uploaded_at: datetime