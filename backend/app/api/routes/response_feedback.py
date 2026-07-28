from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.chat_message import ChatMessage
from app.models.company import Company
from app.models.conversation import Conversation
from app.models.response_feedback import ResponseFeedback
from app.schemas.response_feedback import (
    ResponseFeedbackCreate,
    ResponseFeedbackResponse,
)


router = APIRouter(
    prefix="/response-feedback",
    tags=["Response Feedback"],
)

DatabaseSession = Annotated[Session, Depends(get_db)]


@router.post(
    "",
    response_model=ResponseFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_response_feedback(
    payload: ResponseFeedbackCreate,
    database: DatabaseSession,
) -> ResponseFeedback:
    if database.get(Company, payload.company_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    conversation = database.get(
        Conversation,
        payload.conversation_id,
    )
    message = database.get(
        ChatMessage,
        payload.message_id,
    )

    if (
        conversation is None
        or conversation.company_id != payload.company_id
        or message is None
        or message.conversation_id != conversation.id
        or message.role != "assistant"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The feedback target is invalid.",
        )

    feedback = ResponseFeedback(
        **payload.model_dump()
    )
    database.add(feedback)
    database.commit()
    database.refresh(feedback)
    return feedback
