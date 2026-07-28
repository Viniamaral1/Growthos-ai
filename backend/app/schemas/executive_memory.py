from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ExecutiveMemoryType = Literal[
    "decision",
    "fact",
    "preference",
    "goal",
    "risk",
    "customer",
    "competitor",
    "strategy",
    "meeting",
    "task",
]


class ExecutiveMemoryCreate(BaseModel):
    company_id: int = Field(gt=0)
    executive_role: str = Field(min_length=2, max_length=40)
    memory_type: ExecutiveMemoryType = "fact"
    title: str = Field(min_length=2, max_length=180)
    summary: str = Field(min_length=2, max_length=4000)
    details: str | None = Field(default=None, max_length=12000)
    importance: int = Field(default=5, ge=1, le=10)
    source_conversation_id: int | None = Field(default=None, gt=0)
    source_message_id: int | None = Field(default=None, gt=0)


class ExecutiveMemoryUpdate(BaseModel):
    executive_role: str | None = Field(default=None, min_length=2, max_length=40)
    memory_type: ExecutiveMemoryType | None = None
    title: str | None = Field(default=None, min_length=2, max_length=180)
    summary: str | None = Field(default=None, min_length=2, max_length=4000)
    details: str | None = Field(default=None, max_length=12000)
    importance: int | None = Field(default=None, ge=1, le=10)
    is_archived: bool | None = None


class ExecutiveMemoryResponse(BaseModel):
    id: int
    company_id: int
    executive_role: str
    memory_type: str
    title: str
    summary: str
    details: str | None
    importance: int
    source_conversation_id: int | None
    source_message_id: int | None
    is_archived: bool
    times_used: int
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
