import json
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.company import Company
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.chat_message import ChatMessage
from app.models.conversation import Conversation
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.schemas.search import (
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticSearchResult,
    WorkspaceSemanticSearchRequest,
    WorkspaceSemanticSearchResponse,
    WorkspaceSemanticSearchResult,
)
from app.services.embedding_service import (
    cosine_similarity_score,
    create_query_embedding,
    create_embeddings,
)


router = APIRouter(
    prefix="/search",
    tags=["Semantic Search"],
)


DatabaseSession = Annotated[
    Session,
    Depends(get_db),
]


@router.post(
    "/semantic",
    response_model=SemanticSearchResponse,
)
def semantic_search(
    search_request: SemanticSearchRequest,
    database: DatabaseSession,
) -> SemanticSearchResponse:
    """
    Search company documents using vector similarity.
    """

    company = database.get(
        Company,
        search_request.company_id,
    )

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    query_embedding = create_query_embedding(
        search_request.query
    )

    statement = (
        select(
            DocumentChunk,
            Document,
        )
        .join(
            Document,
            Document.id
            == DocumentChunk.document_id,
        )
        .where(
            Document.company_id
            == search_request.company_id
        )
        .where(
            DocumentChunk.embedding_json.is_not(
                None
            )
        )
    )

    rows = database.execute(
        statement
    ).all()

    ranked_results: list[
        SemanticSearchResult
    ] = []

    for chunk, document in rows:
        if not chunk.embedding_json:
            continue

        try:
            stored_embedding = json.loads(
                chunk.embedding_json
            )

            score = cosine_similarity_score(
                query_embedding,
                stored_embedding,
            )

        except (
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ):
            continue

        if score < search_request.minimum_score:
            continue

        ranked_results.append(
            SemanticSearchResult(
                chunk_id=chunk.id,
                document_id=document.id,
                document_name=(
                    document.original_filename
                ),
                page_number=chunk.page_number,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                similarity_score=round(
                    score,
                    4,
                ),
            )
        )

    ranked_results.sort(
        key=lambda result: (
            result.similarity_score
        ),
        reverse=True,
    )

    selected_results = ranked_results[
        : search_request.limit
    ]

    return SemanticSearchResponse(
        company_id=search_request.company_id,
        query=search_request.query,
        result_count=len(
            selected_results
        ),
        results=selected_results,
    )

@router.post(
    "/workspace",
    response_model=WorkspaceSemanticSearchResponse,
)
def workspace_semantic_search(
    search_request: WorkspaceSemanticSearchRequest,
    database: DatabaseSession,
) -> WorkspaceSemanticSearchResponse:
    """Search one workspace source at a time with strict safety bounds.

    Knowledge keeps vector matching because its bounded candidate set is small.
    Executive Team search deliberately avoids generating embeddings during a
    request. It searches compact conversation summaries with lightweight lexical
    relevance, preventing long conversations from exhausting local memory.
    """

    import re
    from collections import Counter

    company = database.get(Company, search_request.company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    searched_knowledge = search_request.scope == "knowledge"
    searched_chat = search_request.scope == "chat"

    if searched_knowledge:
        candidate_limit_by_mode = {"safe": 24, "balanced": 36, "deep": 50}
        candidate_limit = candidate_limit_by_mode[search_request.performance_mode]
        maximum_text_length = 1800

        statement = (
            select(KnowledgeItem, KnowledgeSpace)
            .join(KnowledgeSpace, KnowledgeSpace.id == KnowledgeItem.space_id)
            .where(KnowledgeItem.company_id == search_request.company_id)
            .order_by(KnowledgeItem.created_at.desc())
            .limit(candidate_limit)
        )

        if search_request.current_space_only:
            if search_request.active_space_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An active Knowledge Space is required for current-space search.",
                )
            statement = statement.where(
                KnowledgeItem.space_id == search_request.active_space_id
            )

        candidates: list[dict[str, object]] = []
        for item, space in database.execute(statement).all():
            text = "\n".join(
                part for part in [item.title, item.summary, item.content] if part
            ).strip()
            if not text:
                continue
            candidates.append({
                "text": text[:maximum_text_length],
                "source_id": item.id,
                "title": item.title,
                "content": item.content,
                "created_at": item.created_at.isoformat(),
                "space_id": item.space_id,
                "space_name": space.name,
                "item_type": item.item_type,
            })

        if not candidates:
            return WorkspaceSemanticSearchResponse(
                company_id=search_request.company_id,
                query=search_request.query,
                result_count=0,
                searched_knowledge=True,
                searched_chat=False,
                search_strategy="semantic",
                indexed_history_available=False,
                results=[],
            )

        query_embedding = create_query_embedding(search_request.query)
        candidate_embeddings = create_embeddings(
            candidate["text"] for candidate in candidates
        )
        ranked: list[WorkspaceSemanticSearchResult] = []

        for candidate, embedding in zip(candidates, candidate_embeddings, strict=False):
            try:
                score = cosine_similarity_score(query_embedding, embedding)
            except (TypeError, ValueError):
                continue
            if score < search_request.minimum_score:
                continue

            content = str(candidate["content"] or "")
            compact = " ".join(content.split())
            snippet = compact[:240] + ("…" if len(compact) > 240 else "")
            ranked.append(
                WorkspaceSemanticSearchResult(
                    source_type="knowledge",
                    source_id=int(candidate["source_id"]),
                    title=str(candidate["title"] or "Knowledge item"),
                    snippet=snippet,
                    content=content,
                    similarity_score=round(score, 4),
                    created_at=str(candidate["created_at"]),
                    space_id=candidate["space_id"],
                    space_name=str(candidate["space_name"]),
                    item_type=str(candidate["item_type"] or "note"),
                )
            )

        ranked.sort(key=lambda result: result.similarity_score, reverse=True)
        selected = ranked[: search_request.limit]
        return WorkspaceSemanticSearchResponse(
            company_id=search_request.company_id,
            query=search_request.query,
            result_count=len(selected),
            searched_knowledge=True,
            searched_chat=False,
            search_strategy="semantic",
            indexed_history_available=False,
            results=selected,
        )

    # Executive Team: no embedding generation during search.
    # The result is intentionally summary-first and bounded.
    stop_words = {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
        "has", "have", "i", "in", "is", "it", "of", "on", "or", "that",
        "the", "this", "to", "was", "we", "were", "what", "when", "where",
        "which", "with", "you", "your",
    }

    def tokens(value: str) -> list[str]:
        return [
            token
            for token in re.findall(r"[a-z0-9]+", value.lower())
            if len(token) > 1 and token not in stop_words
        ]

    query_tokens = tokens(search_request.query)
    if not query_tokens:
        return WorkspaceSemanticSearchResponse(
            company_id=search_request.company_id,
            query=search_request.query,
            result_count=0,
            searched_knowledge=False,
            searched_chat=True,
            search_strategy="safe_summary",
            indexed_history_available=False,
            results=[],
        )

    mode_limits = {
        "summaries": 20,
        "current": 1,
        "recent_5": 5,
        "recent_20": 20,
        "saved": 30,
        "full_history": 60,
    }
    performance_caps = {"safe": 12, "balanced": 30, "deep": 60}
    conversation_limit = min(
        mode_limits[search_request.chat_mode],
        performance_caps[search_request.performance_mode],
    )

    conversation_statement = (
        select(Conversation)
        .where(Conversation.company_id == search_request.company_id)
        .order_by(Conversation.updated_at.desc())
        .limit(conversation_limit)
    )
    if search_request.chat_mode == "current" and search_request.current_conversation_id:
        conversation_statement = conversation_statement.where(
            Conversation.id == search_request.current_conversation_id
        )

    conversations = database.execute(conversation_statement).scalars().all()
    ranked_chat: list[WorkspaceSemanticSearchResult] = []

    for conversation in conversations:
        message_limit = 8 if search_request.chat_mode == "current" else 4
        messages = database.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(message_limit)
        ).scalars().all()
        if not messages:
            continue

        chronological = list(reversed(messages))
        compact_messages = []
        for message in chronological:
            content = " ".join((message.content or "").split())
            if not content:
                continue
            compact_messages.append(f"{message.role}: {content[:700]}")

        title = conversation.title or "Executive Team conversation"
        summary = "\n".join(compact_messages)
        searchable = f"{title}\n{summary}"[:3200]
        document_tokens = tokens(searchable)
        if not document_tokens:
            continue

        counts = Counter(document_tokens)
        overlap = sum(min(counts[token], 2) for token in set(query_tokens))
        coverage = overlap / max(len(set(query_tokens)), 1)
        phrase_bonus = 0.18 if search_request.query.lower() in searchable.lower() else 0.0
        title_overlap = len(set(query_tokens) & set(tokens(title)))
        title_bonus = min(title_overlap * 0.12, 0.30)
        score = min(0.99, (coverage * 0.72) + phrase_bonus + title_bonus)

        # A lower threshold is appropriate for bounded lexical summary search.
        if score < 0.18:
            continue

        newest = messages[0]
        snippet_source = " ".join((newest.content or "").split())
        snippet = snippet_source[:240] + ("…" if len(snippet_source) > 240 else "")
        ranked_chat.append(
            WorkspaceSemanticSearchResult(
                source_type="chat",
                source_id=conversation.id,
                title=title,
                snippet=snippet,
                content=summary,
                similarity_score=round(score, 4),
                created_at=(conversation.updated_at or conversation.created_at).isoformat(),
                conversation_id=conversation.id,
                conversation_title=title,
                message_role=None,
            )
        )

    ranked_chat.sort(key=lambda result: result.similarity_score, reverse=True)
    selected_chat = ranked_chat[: search_request.limit]
    return WorkspaceSemanticSearchResponse(
        company_id=search_request.company_id,
        query=search_request.query,
        result_count=len(selected_chat),
        searched_knowledge=False,
        searched_chat=True,
        search_strategy="safe_summary",
        indexed_history_available=False,
        results=selected_chat,
    )
