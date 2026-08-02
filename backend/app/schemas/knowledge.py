from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class KnowledgeSpaceCreate(BaseModel):
    company_id: int
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    color: str = Field(default="cyan", max_length=32)


class KnowledgeSpaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=32)
    is_archived: bool | None = None


class KnowledgeSpaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    name: str
    description: str | None
    color: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class KnowledgeItemCreate(BaseModel):
    company_id: int
    space_id: int
    item_type: str = Field(default="note", max_length=40)
    title: str = Field(min_length=2, max_length=200)
    summary: str = Field(min_length=2, max_length=5000)
    content: str = Field(min_length=2)
    tags: list[str] = Field(default_factory=list, max_length=20)
    source_conversation_id: int | None = None
    source_message_id: int | None = None




class KnowledgeItemUpdate(BaseModel):
    item_type: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    summary: str | None = Field(default=None, min_length=2, max_length=5000)
    content: str | None = Field(default=None, min_length=2)
    tags: list[str] | None = Field(default=None, max_length=20)
    space_id: int | None = None


class KnowledgeItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    space_id: int
    item_type: str
    title: str
    summary: str
    content: str
    tags_json: str | None
    source_conversation_id: int | None
    source_message_id: int | None
    created_at: datetime
    updated_at: datetime


class KnowledgeSpaceSummary(BaseModel):
    space: KnowledgeSpaceResponse
    total_items: int
    counts_by_type: dict[str, int]
    summary: str
    open_questions: list[str]
