from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentChunkResponse(BaseModel):
    """
    A document chunk returned by the API.
    """

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    document_id: int
    chunk_index: int
    page_number: int | None
    text: str
    character_count: int
    embedding_model: str | None
    created_at: datetime