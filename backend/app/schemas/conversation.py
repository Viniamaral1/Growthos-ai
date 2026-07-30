from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.answer import AnswerSource


class ConversationCreate(BaseModel):
    company_id: int = Field(gt=0)
    title: str | None = Field(
        default=None,
        max_length=160,
    )
    document_id: int | None = Field(
        default=None,
        gt=0,
    )


class ConversationUpdate(BaseModel):
    title: str = Field(
        min_length=2,
        max_length=160,
    )


class ChatMessageUpdate(BaseModel):
    content: str = Field(
        min_length=2,
        max_length=6000,
    )


class ConversationSummary(BaseModel):
    id: int
    company_id: int
    title: str
    document_id: int | None
    document_name: str | None
    message_count: int
    last_message_preview: str | None
    created_at: datetime
    updated_at: datetime


class ChatMessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    model: str | None
    executive_role: str | None = None
    confidence_level: str | None = None
    confidence_score: int | None = None
    confidence_reason: str | None = None
    sources: list[AnswerSource]
    created_at: datetime


class ConversationDetail(ConversationSummary):
    messages: list[ChatMessageResponse]


class ChatMessageCreate(BaseModel):
    executive_role: Literal["auto", "ceo", "cfo", "cmo", "coo", "research", "board"] = "auto"
    research_mode: bool = False
    content: str = Field(
        min_length=2,
        max_length=6000,
    )
    document_id: int | None = Field(
        default=None,
        gt=0,
    )
    document_ids: list[int] = Field(
        default_factory=list,
        max_length=12,
    )
    use_all_documents: bool = False
