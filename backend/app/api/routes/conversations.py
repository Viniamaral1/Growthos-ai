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
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database.session import (
    SessionLocal,
    get_db,
)
from app.models.chat_message import ChatMessage
from app.models.company import Company
from app.models.conversation import Conversation
from app.models.document import Document
from app.models.research_project import ResearchProject
from app.schemas.answer import AnswerSource
from app.schemas.conversation import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatMessageUpdate,
    ConversationCreate,
    ConversationDetail,
    ConversationSummary,
    ConversationUpdate,
)
from app.services.answer_service import (
    AnswerGenerationError,
    get_ollama_model,
)
from app.services.confidence_service import (
    assess_confidence,
)
from app.services.executive_service import (
    route_executive_role,
)
from app.services.smart_context_service import (
    plan_context,
)
from app.services.executive_memory_service import (
    propose_memory_from_exchange,
)
from app.services.generation_cancellation_service import (
    begin_generation,
    cancel_generation,
    finish_generation,
)
from app.services.research_project_service import (
    ResearchProjectGenerationError,
    create_discovery,
    create_plan,
    discovery_chat_reply,
    extract_discovery_answers,
    is_research_discovery_intent,
    is_direct_task_intent,
    should_continue_research,
    remaining_questions_chat_reply,
)
from app.services.cofounder_chat_service import (
    GenerationCancelled,
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


def _supported_chat_message_kwargs(
    **values: object,
) -> dict[str, object]:
    """Keep stream saving compatible with a stale ORM class."""

    return {
        key: value
        for key, value in values.items()
        if hasattr(ChatMessage, key)
    }


def _message_response(
    message: ChatMessage,
) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        model=message.model,
        executive_role=getattr(message, "executive_role", None),
        confidence_level=getattr(
            message,
            "confidence_level",
            None,
        ),
        confidence_score=getattr(
            message,
            "confidence_score",
            None,
        ),
        confidence_reason=getattr(
            message,
            "confidence_reason",
            None,
        ),
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




@router.patch(
    "/{conversation_id}/messages/{message_id}",
    response_model=ConversationDetail,
)
def edit_user_message(
    conversation_id: int,
    message_id: int,
    payload: ChatMessageUpdate,
    database: DatabaseSession,
) -> ConversationDetail:
    """Replace a user prompt and remove later messages before regeneration."""
    conversation = database.get(Conversation, conversation_id)
    message = database.get(ChatMessage, message_id)

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    if (
        message is None
        or message.conversation_id != conversation_id
        or message.role != "user"
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Editable user message not found.",
        )

    # Remove this prompt and everything after it. The edited text is then
    # submitted through the normal streaming endpoint, keeping one clean branch.
    database.execute(
        delete(ChatMessage).where(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.id >= message_id,
        )
    )
    conversation.message_count = int(
        database.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.conversation_id == conversation_id
            )
        )
        or 0
    )
    conversation.updated_at = datetime.now(timezone.utc)
    database.add(conversation)
    database.commit()

    return get_conversation(conversation_id, database)


@router.post(
    "/{conversation_id}/cancel",
)
def cancel_conversation_generation(
    conversation_id: int,
    database: DatabaseSession,
) -> dict[str, object]:
    conversation = database.get(
        Conversation,
        conversation_id,
    )

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    return {
        "conversation_id": conversation_id,
        "cancelled": cancel_generation(
            conversation_id
        ),
    }


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

    selected_document_ids = {
        item
        for item in payload.document_ids
        if item > 0
    }

    if document_id is not None:
        selected_document_ids.add(
            document_id
        )

    selected_document_names: list[str] = []

    for selected_document_id in (
        selected_document_ids
    ):
        document = database.get(
            Document,
            selected_document_id,
        )

        if (
            document is None
            or document.company_id
            != conversation.company_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "A selected document was not found "
                    "for this workspace."
                ),
            )

        if document.processing_status != "processed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A selected document is not ready for AI."
                ),
            )

        selected_document_names.append(
            document.original_filename
        )

    document_scope_enabled = (
        bool(selected_document_ids)
        or payload.use_all_documents
    )

    context_plan = plan_context(
        payload.content,
        document_scope_enabled=(
            document_scope_enabled
        ),
        explicit_document_scope=bool(
            selected_document_ids
        ),
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
            document_ids=sorted(
                selected_document_ids
            ),
            use_all_documents=payload.use_all_documents,
            context_plan=context_plan,
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

    cancellation_event = begin_generation(
        conversation.id
    )

    def event_stream():
        assistant_text = ""
        model_name = get_ollama_model()

        resolved_executive_role = route_executive_role(
            payload.content.strip(),
            payload.executive_role,
        )

        confidence = assess_confidence(
            source_count=len(response_sources),
            document_scope_enabled=(
                document_scope_enabled
            ),
        )

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
            "executive_role": resolved_executive_role,
            "confidence_level": confidence.level,
            "confidence_score": confidence.score,
            "confidence_reason": confidence.reason,
            "context_mode": (
                context_plan.context_mode()
            ),
            "context_sources": (
                context_plan.selected_sources()
            ),
            "context_reason": (
                context_plan.reason()
            ),
        }

        yield json.dumps(
            metadata,
            ensure_ascii=False,
        ) + "\n"

        # Research discovery is a first-class chat capability. Explicit mode
        # always wins; automatic routing is deliberately conservative.
        research_project_id = getattr(conversation, "active_research_project_id", None)
        research_requested = should_continue_research(
            message=payload.content,
            explicit_research_mode=payload.research_mode,
            active_project=research_project_id is not None,
        )

        # Re-evaluate every turn. Immediate deliverables and explicit topic
        # changes interrupt discovery even when the Research toggle was left on.
        # The project remains saved, but it is detached from this conversation.
        if research_project_id is not None and not research_requested:
            with SessionLocal() as mode_database:
                saved_conversation = mode_database.get(Conversation, conversation.id)
                if saved_conversation is not None:
                    saved_conversation.active_research_project_id = None
                    mode_database.add(saved_conversation)
                    mode_database.commit()
            research_project_id = None

        if research_requested:
            try:
                with SessionLocal() as research_database:
                    saved_conversation = research_database.get(Conversation, conversation.id)
                    project = (
                        research_database.get(ResearchProject, research_project_id)
                        if research_project_id is not None
                        else None
                    )

                    if project is None:
                        discovery, model_name = create_discovery(
                            company, payload.content.strip(), None
                        )
                        project = ResearchProject(
                            company_id=company.id,
                            title=discovery.title,
                            goal=payload.content.strip(),
                            context=None,
                            status="ready" if not discovery.questions else "discovery",
                            project_type=discovery.project_type,
                            deliverable_type="research_report",
                            questions_json=json.dumps(
                                [question.model_dump() for question in discovery.questions],
                                ensure_ascii=False,
                            ),
                            answers_json="{}",
                            assumptions_json=json.dumps(discovery.assumptions, ensure_ascii=False),
                            model=model_name,
                        )
                        research_database.add(project)
                        research_database.flush()
                        if saved_conversation is not None:
                            saved_conversation.active_research_project_id = project.id
                            research_database.add(saved_conversation)
                        assistant_text = discovery_chat_reply(discovery, project.id)
                    else:
                        questions = json.loads(project.questions_json or "[]")
                        answers = json.loads(project.answers_json or "{}")
                        normalized = payload.content.strip().lower()

                        if normalized in {
                            "build the research plan", "build research plan",
                            "create the research plan", "generate the research plan",
                            "create research plan", "generate research plan",
                        }:
                            required_ids = {
                                str(item.get("id", "")) for item in questions
                                if item.get("required", True)
                            }
                            answered_ids = {
                                key for key, value in answers.items() if str(value).strip()
                            }
                            if not required_ids.issubset(answered_ids):
                                assistant_text = remaining_questions_chat_reply(
                                    project.title, questions, answers, project.id
                                )
                            else:
                                plan, model_name = create_plan(
                                    company=company,
                                    goal=project.goal,
                                    context=project.context,
                                    project_type=project.project_type,
                                    questions=questions,
                                    answers=answers,
                                    assumptions=json.loads(project.assumptions_json or "[]"),
                                    deliverable_type=project.deliverable_type,
                                )
                                project.plan_json = json.dumps(plan.model_dump(), ensure_ascii=False)
                                project.assumptions_json = json.dumps(plan.assumptions, ensure_ascii=False)
                                project.status = "planned"
                                project.model = model_name
                                assistant_text = (
                                    f"The research plan for **{project.title}** is ready. "
                                    f"It contains {len(plan.sections)} investigation sections, "
                                    f"{len(plan.source_strategy)} source-strategy rules, and "
                                    f"{len(plan.evaluation_criteria)} evaluation criteria.\n\n"
                                    "Open **Research** to review the complete plan, or continue here with "
                                    "a change such as *add a competitor comparison* or *narrow the geography*."
                                )
                        elif project.status == "discovery":
                            extracted, model_name = extract_discovery_answers(
                                company, project.goal, questions, answers, payload.content.strip()
                            )
                            answers.update(extracted)
                            project.answers_json = json.dumps(answers, ensure_ascii=False)
                            required_ids = {
                                str(item.get("id", "")) for item in questions
                                if item.get("required", True)
                            }
                            complete = required_ids.issubset(
                                {key for key, value in answers.items() if str(value).strip()}
                            )
                            project.status = "ready" if complete else "discovery"
                            project.model = model_name
                            if complete:
                                plan, model_name = create_plan(
                                    company=company,
                                    goal=project.goal,
                                    context=project.context,
                                    project_type=project.project_type,
                                    questions=questions,
                                    answers=answers,
                                    assumptions=json.loads(project.assumptions_json or "[]"),
                                    deliverable_type=project.deliverable_type,
                                )
                                project.plan_json = json.dumps(plan.model_dump(), ensure_ascii=False)
                                project.assumptions_json = json.dumps(plan.assumptions, ensure_ascii=False)
                                project.status = "planned"
                                project.model = model_name
                                assistant_text = (
                                    f"I have enough context now. I’ve created a focused research plan for **{project.title}** "
                                    f"with {len(plan.sections)} investigation areas and clear evidence criteria.\n\n"
                                    "You can continue here to refine the scope, or open **Research** to review and run the plan."
                                )
                            else:
                                assistant_text = remaining_questions_chat_reply(
                                    project.title, questions, answers, project.id
                                )
                        else:
                            assistant_text = (
                                f"**{project.title}** is already linked to this conversation. "
                                "Reply **Build the research plan** to create the structured plan, "
                                "or tell me what you want to change before we continue."
                            )

                    research_database.add(project)
                    assistant_message = ChatMessage(
                        **_supported_chat_message_kwargs(
                            conversation_id=conversation.id,
                            role="assistant",
                            content=assistant_text.strip(),
                            model=model_name,
                            executive_role="research",
                            confidence_level="high",
                            confidence_score=90,
                            confidence_reason="Guided research discovery uses user-provided scope and explicit unknowns.",
                            sources_json="[]",
                        )
                    )
                    research_database.add(assistant_message)
                    if saved_conversation is not None:
                        saved_conversation.message_count += 1
                        saved_conversation.updated_at = datetime.now(timezone.utc)
                        research_database.add(saved_conversation)
                    research_database.commit()
                    research_database.refresh(assistant_message)

                yield json.dumps({"type": "token", "content": assistant_text}, ensure_ascii=False) + "\n"
                yield json.dumps({
                    "type": "done",
                    "memory_proposal": None,
                    "context_mode": "research_discovery",
                    "context_sources": ["guided_research"],
                    "context_reason": "GrowthOS is shaping an idea into a persistent research project.",
                    "research_project_id": project.id,
                    "research_project_status": project.status,
                    "assistant_message": _message_response(assistant_message).model_dump(mode="json"),
                }, ensure_ascii=False) + "\n"
                finish_generation(conversation.id, cancellation_event)
                return
            except ResearchProjectGenerationError as error:
                yield json.dumps({"type": "error", "message": str(error)}, ensure_ascii=False) + "\n"
                finish_generation(conversation.id, cancellation_event)
                return

        try:
            with SessionLocal() as brain_database:
                for token in stream_cofounder_reply(
                    database=brain_database,
                    company=company,
                    previous_messages=previous_messages,
                    user_message=payload.content.strip(),
                    sources=sources,
                    document_scope_enabled=(
                        document_scope_enabled
                    ),
                    executive_role=payload.executive_role,
                    current_conversation_id=conversation.id,
                    selected_document_names=selected_document_names,
                    context_plan=context_plan,
                    cancellation_event=cancellation_event,
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
                    **_supported_chat_message_kwargs(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=assistant_text.strip(),
                        model=model_name,
                        executive_role=resolved_executive_role,
                        confidence_level=confidence.level,
                        confidence_score=confidence.score,
                        confidence_reason=confidence.reason,
                        sources_json=json.dumps(
                            [
                                source.model_dump(mode="json")
                                for source in response_sources
                            ],
                            ensure_ascii=False,
                        ),
                    )
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

                memory_proposal = propose_memory_from_exchange(
                    save_database,
                    company_id=conversation.company_id,
                    executive_role=resolved_executive_role,
                    user_message=payload.content,
                    assistant_message=assistant_text.strip(),
                    conversation_id=conversation.id,
                    message_id=assistant_message.id,
                )

                done_event = {
                    "type": "done",
                    "memory_proposal": memory_proposal,
                    "context_mode": (
                        context_plan.context_mode()
                    ),
                    "context_sources": (
                        context_plan.selected_sources()
                    ),
                    "context_reason": (
                        context_plan.reason()
                    ),
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

            finish_generation(
                conversation.id,
                cancellation_event,
            )

        except GenerationCancelled:
            if assistant_text.strip():
                with SessionLocal() as save_database:
                    saved_conversation = save_database.get(
                        Conversation,
                        conversation.id,
                    )

                    partial_message = ChatMessage(
                        **_supported_chat_message_kwargs(
                            conversation_id=conversation.id,
                            role="assistant",
                            content=assistant_text.strip(),
                            model=model_name,
                            executive_role=resolved_executive_role,
                            confidence_level=confidence.level,
                            confidence_score=confidence.score,
                            confidence_reason=(
                                "Generation was stopped by the user."
                            ),
                            sources_json=json.dumps(
                                [
                                    source.model_dump(mode="json")
                                    for source in response_sources
                                ],
                                ensure_ascii=False,
                            ),
                        )
                    )

                    save_database.add(
                        partial_message
                    )

                    if saved_conversation is not None:
                        saved_conversation.message_count += 1
                        saved_conversation.updated_at = (
                            datetime.now(timezone.utc)
                        )
                        save_database.add(
                            saved_conversation
                        )

                    save_database.commit()
                    save_database.refresh(partial_message)

                    yield json.dumps(
                        {
                            "type": "cancelled",
                            "assistant_message": _message_response(
                                partial_message
                            ).model_dump(mode="json"),
                        },
                        ensure_ascii=False,
                    ) + "\n"

            finish_generation(
                conversation.id,
                cancellation_event,
            )
            return

        except AnswerGenerationError as error:
            error_text = str(error)

            with SessionLocal() as save_database:
                saved_conversation = save_database.get(
                    Conversation,
                    conversation.id,
                )

                error_message = ChatMessage(
                    **_supported_chat_message_kwargs(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=(
                            "I could not complete that reply. "
                            f"{error_text}"
                        ),
                        model=model_name,
                        executive_role=resolved_executive_role,
                        confidence_level="low",
                        confidence_score=20,
                        confidence_reason=(
                            "The model did not complete the response."
                        ),
                        sources_json="[]",
                    )
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

            finish_generation(
                conversation.id,
                cancellation_event,
            )

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
