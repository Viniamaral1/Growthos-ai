import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import (
    SessionLocal,
    get_db,
)
from app.models.chat_message import ChatMessage
from app.models.company import Company
from app.models.conversation import Conversation
from app.models.document import Document
from app.schemas.answer import AnswerSource
from app.schemas.conversation import (
    ChatMessageCreate,
    ChatMessageResponse,
    ConversationCreate,
    ConversationDetail,
    ConversationSummary,
    ConversationUpdate,
)
from app.services.answer_service import (
    AnswerGenerationError,
    get_ollama_model,
)
from app.services.cofounder_chat_service import (
    create_conversation_title,
    retrieve_chat_sources,
    stream_cofounder_reply,
)


router = APIRouter(
    prefix="/conversations",
    tags=["AI Co-Founder Chat"],
)

DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


def _sources(
    message: ChatMessage,
) -> list[AnswerSource]:
    try:
        raw_sources = json.loads(
            message.sources_json
        )
    except (
        json.JSONDecodeError,
        TypeError,
    ):
        raw_sources = []

    return [
        AnswerSource.model_validate(source)
        for source in raw_sources
    ]


def _message_response(
    message: ChatMessage,
) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        model=message.model,
        sources=_sources(message),
        created_at=message.created_at,
    )


def _document_name(
    database: Session,
    document_id: int | None,
) -> str | None:
    if document_id is None:
        return None

    document = database.get(
        Document,
        document_id,
    )

    return (
        document.original_filename
        if document is not None
        else None
    )


def _summary(
    database: Session,
    conversation: Conversation,
) -> ConversationSummary:
    last_message = database.scalar(
        select(ChatMessage)
        .where(
            ChatMessage.conversation_id
            == conversation.id
        )
        .order_by(
            ChatMessage.created_at.desc(),
            ChatMessage.id.desc(),
        )
        .limit(1)
    )

    preview = None
    if last_message is not None:
        preview = (
            last_message.content
            .replace("\n", " ")
            .strip()[:120]
        )

    return ConversationSummary(
        id=conversation.id,
        company_id=conversation.company_id,
        title=conversation.title,
        document_id=conversation.document_id,
        document_name=_document_name(
            database,
            conversation.document_id,
        ),
        message_count=conversation.message_count,
        last_message_preview=preview,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get(
    "",
    response_model=list[ConversationSummary],
)
def list_conversations(
    company_id: int,
    database: DatabaseSession,
) -> list[ConversationSummary]:
    company = database.get(
        Company,
        company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    conversations = database.scalars(
        select(Conversation)
        .where(
            Conversation.company_id
            == company_id
        )
        .order_by(
            Conversation.updated_at.desc(),
            Conversation.id.desc(),
        )
    ).all()

    return [
        _summary(database, conversation)
        for conversation in conversations
    ]


@router.post(
    "",
    response_model=ConversationDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    payload: ConversationCreate,
    database: DatabaseSession,
) -> ConversationDetail:
    company = database.get(
        Company,
        payload.company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    if payload.document_id is not None:
        document = database.get(
            Document,
            payload.document_id,
        )

        if (
            document is None
            or document.company_id
            != payload.company_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found for this workspace.",
            )

    conversation = Conversation(
        company_id=payload.company_id,
        title=(
            payload.title.strip()
            if payload.title
            else "New conversation"
        ),
        document_id=payload.document_id,
    )

    database.add(conversation)
    database.commit()
    database.refresh(conversation)

    summary = _summary(
        database,
        conversation,
    )

    return ConversationDetail(
        **summary.model_dump(),
        messages=[],
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetail,
)
def get_conversation(
    conversation_id: int,
    database: DatabaseSession,
) -> ConversationDetail:
    conversation = database.get(
        Conversation,
        conversation_id,
    )

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    messages = database.scalars(
        select(ChatMessage)
        .where(
            ChatMessage.conversation_id
            == conversation.id
        )
        .order_by(
            ChatMessage.created_at.asc(),
            ChatMessage.id.asc(),
        )
    ).all()

    summary = _summary(
        database,
        conversation,
    )

    return ConversationDetail(
        **summary.model_dump(),
        messages=[
            _message_response(message)
            for message in messages
        ],
    )


@router.patch(
    "/{conversation_id}",
    response_model=ConversationSummary,
)
def rename_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    database: DatabaseSession,
) -> ConversationSummary:
    conversation = database.get(
        Conversation,
        conversation_id,
    )

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    conversation.title = payload.title.strip()
    conversation.updated_at = datetime.now(timezone.utc)

    database.add(conversation)
    database.commit()
    database.refresh(conversation)

    return _summary(database, conversation)


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    conversation_id: int,
    database: DatabaseSession,
) -> None:
    conversation = database.get(
        Conversation,
        conversation_id,
    )

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    messages = database.scalars(
        select(ChatMessage)
        .where(
            ChatMessage.conversation_id
            == conversation.id
        )
    ).all()

    for message in messages:
        database.delete(message)

    database.delete(conversation)
    database.commit()


@router.post(
    "/{conversation_id}/messages/stream",
)
def stream_message(
    conversation_id: int,
    payload: ChatMessageCreate,
    database: DatabaseSession,
) -> StreamingResponse:
    conversation = database.get(
        Conversation,
        conversation_id,
    )

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    company = database.get(
        Company,
        conversation.company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business workspace not found.",
        )

    document_id = payload.document_id

    if document_id is not None:
        document = database.get(
            Document,
            document_id,
        )

        if (
            document is None
            or document.company_id
            != conversation.company_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found for this workspace.",
            )

        if document.processing_status != "processed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The selected document is not ready for AI.",
            )

    previous_messages = list(
        database.scalars(
            select(ChatMessage)
            .where(
                ChatMessage.conversation_id
                == conversation.id
            )
            .order_by(
                ChatMessage.created_at.asc(),
                ChatMessage.id.asc(),
            )
        ).all()
    )

    try:
        sources = retrieve_chat_sources(
            database=database,
            company_id=conversation.company_id,
            question=payload.content,
            document_id=document_id,
            use_all_documents=payload.use_all_documents,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    user_message = ChatMessage(
        conversation_id=conversation.id,
        role="user",
        content=payload.content.strip(),
        sources_json="[]",
    )

    if (
        conversation.message_count == 0
        and conversation.title == "New conversation"
    ):
        conversation.title = create_conversation_title(
            payload.content
        )

    conversation.document_id = document_id
    conversation.message_count += 1
    conversation.updated_at = datetime.now(timezone.utc)

    database.add(user_message)
    database.add(conversation)
    database.commit()
    database.refresh(user_message)
    database.refresh(conversation)

    response_sources = [
        AnswerSource(
            source_id=str(source["source_id"]),
            chunk_id=int(source["chunk_id"]),
            document_id=int(source["document_id"]),
            document_name=str(
                source["document_name"]
            ),
            page_number=(
                int(source["page_number"])
                if source["page_number"] is not None
                else None
            ),
            similarity_score=float(
                source["similarity_score"]
            ),
            text=str(source["text"]),
        )
        for source in sources
    ]

    def event_stream():
        assistant_text = ""
        model_name = get_ollama_model()

        metadata = {
            "type": "metadata",
            "conversation_id": conversation.id,
            "conversation_title": conversation.title,
            "user_message": _message_response(
                user_message
            ).model_dump(mode="json"),
            "sources": [
                source.model_dump(mode="json")
                for source in response_sources
            ],
            "model": model_name,
        }

        yield json.dumps(
            metadata,
            ensure_ascii=False,
        ) + "\n"

        try:
            for token in stream_cofounder_reply(
                company=company,
                previous_messages=previous_messages,
                user_message=payload.content.strip(),
                sources=sources,
            ):
                assistant_text += token

                yield json.dumps(
                    {
                        "type": "token",
                        "content": token,
                    },
                    ensure_ascii=False,
                ) + "\n"

            with SessionLocal() as save_database:
                saved_conversation = save_database.get(
                    Conversation,
                    conversation.id,
                )

                assistant_message = ChatMessage(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=assistant_text.strip(),
                    model=model_name,
                    sources_json=json.dumps(
                        [
                            source.model_dump(mode="json")
                            for source in response_sources
                        ],
                        ensure_ascii=False,
                    ),
                )

                save_database.add(assistant_message)

                if saved_conversation is not None:
                    saved_conversation.message_count += 1
                    saved_conversation.updated_at = (
                        datetime.now(timezone.utc)
                    )
                    save_database.add(saved_conversation)

                save_database.commit()
                save_database.refresh(assistant_message)

                done_event = {
                    "type": "done",
                    "assistant_message": (
                        _message_response(
                            assistant_message
                        ).model_dump(mode="json")
                    ),
                }

            yield json.dumps(
                done_event,
                ensure_ascii=False,
            ) + "\n"

        except AnswerGenerationError as error:
            error_text = str(error)

            with SessionLocal() as save_database:
                saved_conversation = save_database.get(
                    Conversation,
                    conversation.id,
                )

                error_message = ChatMessage(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=(
                        "I could not complete that reply. "
                        f"{error_text}"
                    ),
                    model=model_name,
                    sources_json="[]",
                )

                save_database.add(error_message)

                if saved_conversation is not None:
                    saved_conversation.message_count += 1
                    saved_conversation.updated_at = (
                        datetime.now(timezone.utc)
                    )
                    save_database.add(saved_conversation)

                save_database.commit()
                save_database.refresh(error_message)

            yield json.dumps(
                {
                    "type": "error",
                    "message": error_text,
                    "assistant_message": (
                        _message_response(
                            error_message
                        ).model_dump(mode="json")
                    ),
                },
                ensure_ascii=False,
            ) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
