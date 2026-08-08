from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.document import Document
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.services.embedding_service import cosine_similarity_score, create_embeddings, create_query_embedding

_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "we",
    "were", "with", "you", "your", "our", "their", "they", "will", "can", "may",
}


@dataclass(frozen=True)
class _WorkspaceProfile:
    company: Company
    text: str


def _clip(value: object, maximum: int = 3200) -> str:
    return " ".join(str(value or "").split())[:maximum]


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in _STOP_WORDS
    }


def _workspace_profile(database: Session, company: Company, exclude_document_id: int | None = None) -> _WorkspaceProfile:
    spaces = list(database.scalars(
        select(KnowledgeSpace)
        .where(
            KnowledgeSpace.company_id == company.id,
            KnowledgeSpace.is_archived.is_(False),
        )
        .order_by(KnowledgeSpace.updated_at.desc())
        .limit(8)
    ).all())

    items = list(database.scalars(
        select(KnowledgeItem)
        .where(KnowledgeItem.company_id == company.id)
        .order_by(KnowledgeItem.created_at.desc())
        .limit(10)
    ).all())

    document_statement = select(Document).where(
        Document.company_id == company.id,
        Document.processing_status == "processed",
    )
    if exclude_document_id is not None:
        document_statement = document_statement.where(Document.id != exclude_document_id)
    documents = list(database.scalars(
        document_statement.order_by(Document.processed_at.desc()).limit(8)
    ).all())

    parts = [
        company.name,
        company.industry,
        company.target_audience,
        company.product_description,
        company.business_idea or "",
        company.problem_statement or "",
        company.proposed_solution or "",
        company.primary_goal or "",
        company.business_model or "",
        *[f"Knowledge space: {space.name}. {space.description or ''}" for space in spaces],
        *[f"Knowledge: {item.title}. {item.summary}" for item in items],
        *[f"Document: {document.original_filename}" for document in documents],
    ]
    return _WorkspaceProfile(company=company, text=_clip("\n".join(parts), 5000))


def assess_document_relevance(database: Session, company_id: int, document_id: int) -> dict[str, object]:
    """Assess whether one processed document belongs in the selected workspace.

    Uses local semantic embeddings plus deterministic project-name and lexical signals.
    It deliberately does not call the generative LLM, so the check stays fast and bounded.
    """
    current = database.get(Company, company_id)
    document = database.get(Document, document_id)

    if current is None:
        raise ValueError("Workspace not found")
    if document is None:
        raise ValueError("Document not found")
    if document.company_id != company_id:
        raise ValueError("Document is not stored in this workspace")
    if document.processing_status != "processed":
        raise ValueError("Process the document before checking project relevance")

    document_text = _clip(document.extracted_text, 3200)
    if not document_text:
        raise ValueError("The document has no extracted text to compare")

    companies = list(database.scalars(select(Company).order_by(Company.updated_at.desc()).limit(12)).all())
    profiles = [_workspace_profile(database, company, document.id) for company in companies]
    if not profiles:
        raise ValueError("No workspaces are available")

    query_embedding = create_query_embedding(document_text)
    profile_embeddings = create_embeddings(profile.text for profile in profiles)
    document_tokens = _tokens(document_text)
    lowered_document = document_text.lower()

    scored: list[tuple[float, _WorkspaceProfile, float, int, bool]] = []
    for profile, embedding in zip(profiles, profile_embeddings, strict=False):
        semantic = cosine_similarity_score(query_embedding, embedding)
        profile_tokens = _tokens(profile.text)
        overlap_count = len(document_tokens & profile_tokens)
        lexical_bonus = min(0.12, overlap_count * 0.008)
        name_mentioned = profile.company.name.lower() in lowered_document
        name_bonus = 0.18 if name_mentioned else 0.0
        score = semantic + lexical_bonus + name_bonus
        scored.append((score, profile, semantic, overlap_count, name_mentioned))

    scored.sort(key=lambda row: row[0], reverse=True)
    current_row = next((row for row in scored if row[1].company.id == company_id), scored[0])
    best_row = scored[0]

    current_score, _, semantic, overlap_count, current_name_mentioned = current_row
    best_score, best_profile, _, _, _ = best_row
    gap = best_score - current_score

    # Convert the ranking score into a conservative user-facing confidence.
    confidence = round(max(5, min(98, (current_score - 0.28) * 120)))
    if current_name_mentioned:
        confidence = max(confidence, 88)

    if current_name_mentioned or current_score >= 0.68:
        level = "high"
    elif current_score >= 0.54 and gap < 0.07:
        level = "medium"
    else:
        level = "low"

    suggested_company_id: int | None = None
    suggested_company_name: str | None = None
    if best_profile.company.id != company_id and best_score >= current_score + 0.05:
        suggested_company_id = best_profile.company.id
        suggested_company_name = best_profile.company.name

    reasons: list[str] = []
    if current_name_mentioned:
        reasons.append(f"The asset explicitly mentions {current.name}.")
    if overlap_count >= 6:
        reasons.append(f"It shares {overlap_count} meaningful terms with this workspace profile and recent knowledge.")
    elif overlap_count > 0:
        reasons.append(f"It has limited topic overlap with this workspace ({overlap_count} shared terms).")
    else:
        reasons.append("It has very little direct topic overlap with this workspace.")
    if semantic >= 0.62:
        reasons.append("Semantic similarity to the workspace is strong.")
    elif semantic >= 0.50:
        reasons.append("Semantic similarity is moderate.")
    else:
        reasons.append("Semantic similarity is weak.")
    if suggested_company_name:
        reasons.append(f"It appears more similar to the {suggested_company_name} workspace.")

    if level == "high":
        recommendation = "This asset looks relevant to the current project."
    elif level == "medium":
        recommendation = "Project fit is uncertain. Review before mapping entities automatically."
    else:
        recommendation = "This asset may not belong in the current project. Confirm before continuing."

    return {
        "document_id": document.id,
        "company_id": company_id,
        "company_name": current.name,
        "level": level,
        "confidence": confidence,
        "recommendation": recommendation,
        "reasons": reasons[:4],
        "suggested_company_id": suggested_company_id,
        "suggested_company_name": suggested_company_name,
        "method": "semantic_embeddings_with_rules",
    }
