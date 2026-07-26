from typing import Literal

from pydantic import BaseModel


DocumentCategory = Literal[
    "strategy",
    "finance",
    "marketing",
    "operations",
    "research",
    "general",
]


class DocumentClassificationResponse(BaseModel):
    document_id: int
    category: DocumentCategory
    suggested_executive: str
    confidence: int
    signals: list[str]
