from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ResponseFeedbackCreate(BaseModel):
    company_id: int = Field(gt=0)
    conversation_id: int = Field(gt=0)
    message_id: int = Field(gt=0)
    rating: Literal["useful", "not_useful"]
    reason: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=1000)


class ResponseFeedbackResponse(ResponseFeedbackCreate):
    id: int
    created_at: datetime
