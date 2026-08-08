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

_SIGNAL_GROUPS: dict[str, tuple[str, ...]] = {
    "supplier / procurement": ("supplier", "procurement", "purchase", "quotation", "pricing", "delivery", "contract"),
    "recruitment / people": ("cv", "resume", "candidate", "employment", "experience", "skills", "qualification"),
    "finance": ("invoice", "revenue", "expense", "profit", "budget", "cashflow", "payment", "price"),
    "research": ("research", "market", "competitor", "survey", "evidence", "analysis"),
    "operations": ("operations", "process", "delivery", "warehouse", "inventory", "compliance"),
    "marketing": ("marketing", "campaign", "brand", "audience", "social", "lead"),
}


@dataclass(frozen=True)
class _SpaceProfile:
    space: KnowledgeSpace
    text: str


def _clip(value: object, maximum: int = 3200) -> str:
    return " ".join(str(value or "").split())[:maximum]


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in _STOP_WORDS
    }


def _space_profile(database: Session, space: KnowledgeSpace) -> _SpaceProfile:
    items = list(database.scalars(
        select(KnowledgeItem)
        .where(KnowledgeItem.space_id == space.id)
        .order_by(KnowledgeItem.created_at.desc())
        .limit(18)
    ).all())

    parts = [
        f"Project: {space.name}",
        space.description or "",
        *[f"{item.item_type}: {item.title}. {item.summary}" for item in items],
    ]
    return _SpaceProfile(space=space, text=_clip("\n".join(parts), 5200))


def _document_signals(text: str, filename: str) -> list[str]:
    lowered = f"{filename} {text}".lower()
    signals: list[str] = []
    for label, words in _SIGNAL_GROUPS.items():
        if sum(1 for word in words if word in lowered) >= 2:
            signals.append(label)
    return signals[:3]


def _suggest_new_space_name(text: str, filename: str) -> str:
    lowered = f"{filename} {text}".lower()
    if any(term in lowered for term in ("curriculum vitae", "resume", "candidate", "employment history")):
        return "Recruitment"
    if any(term in lowered for term in ("supplier", "quotation", "purchase order", "procurement")):
        return "Suppliers & Procurement"
    if any(term in lowered for term in ("invoice", "cashflow", "profit", "revenue", "expense")):
        return "Finance"
    if any(term in lowered for term in ("campaign", "brand", "marketing", "social media")):
        return "Marketing"
    if any(term in lowered for term in ("research", "competitor", "market analysis", "survey")):
        return "Research"
    if any(term in lowered for term in ("meeting", "minutes", "agenda")):
        return "Meetings"
    return "New Project"


def assess_document_relevance(
    database: Session,
    company_id: int,
    document_id: int,
    target_space_id: int | None = None,
) -> dict[str, object]:
    """Assess a processed asset against Knowledge projects inside one workspace.

    The selected Knowledge Space is the primary comparison target. If no target is
    supplied, GrowthOS ranks the available spaces and proposes the best destination.
    It deliberately avoids comparing against unrelated workspaces, which prevents a
    CV in one project from becoming relevant simply because another project contains CVs.
    """
    company = database.get(Company, company_id)
    document = database.get(Document, document_id)

    if company is None:
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

    spaces = list(database.scalars(
        select(KnowledgeSpace)
        .where(
            KnowledgeSpace.company_id == company_id,
            KnowledgeSpace.is_archived.is_(False),
        )
        .order_by(KnowledgeSpace.updated_at.desc())
        .limit(30)
    ).all())

    target_space: KnowledgeSpace | None = None
    if target_space_id is not None:
        target_space = database.get(KnowledgeSpace, target_space_id)
        if target_space is None or target_space.company_id != company_id or target_space.is_archived:
            raise ValueError("Target project not found")

    if not spaces:
        suggested_new = _suggest_new_space_name(document_text, document.original_filename)
        return {
            "document_id": document.id,
            "company_id": company_id,
            "company_name": company.name,
            "level": "low",
            "confidence": 10,
            "recommendation": "No Knowledge project exists yet for a reliable comparison.",
            "reasons": [
                "GrowthOS has no project-specific knowledge to compare this asset with.",
                f"The content looks most suitable for a project such as {suggested_new}.",
            ],
            "suggested_company_id": None,
            "suggested_company_name": None,
            "target_space_id": None,
            "target_space_name": None,
            "suggested_space_id": None,
            "suggested_space_name": None,
            "suggested_new_space_name": suggested_new,
            "method": "project_semantic_embeddings_with_rules",
        }

    profiles = [_space_profile(database, space) for space in spaces]
    query_embedding = create_query_embedding(document_text)
    profile_embeddings = create_embeddings(profile.text for profile in profiles)
    document_tokens = _tokens(document_text)
    lowered_document = document_text.lower()

    scored: list[tuple[float, _SpaceProfile, float, int, bool]] = []
    for profile, embedding in zip(profiles, profile_embeddings, strict=False):
        semantic = cosine_similarity_score(query_embedding, embedding)
        profile_tokens = _tokens(profile.text)
        overlap_count = len(document_tokens & profile_tokens)
        lexical_bonus = min(0.08, overlap_count * 0.006)
        name_mentioned = profile.space.name.lower() in lowered_document
        name_bonus = 0.16 if name_mentioned else 0.0
        score = semantic + lexical_bonus + name_bonus
        scored.append((score, profile, semantic, overlap_count, name_mentioned))

    scored.sort(key=lambda row: row[0], reverse=True)
    best_row = scored[0]
    selected_row = (
        next((row for row in scored if row[1].space.id == target_space.id), None)
        if target_space is not None
        else best_row
    ) or best_row

    selected_score, selected_profile, semantic, overlap_count, name_mentioned = selected_row
    best_score, best_profile, _, _, _ = best_row
    gap = best_score - selected_score

    confidence = round(max(5, min(97, (selected_score - 0.34) * 135)))
    if name_mentioned:
        confidence = max(confidence, 90)

    if name_mentioned or selected_score >= 0.70:
        level = "high"
    elif selected_score >= 0.56 and (target_space is None or gap < 0.07):
        level = "medium"
    else:
        level = "low"

    suggested_space_id: int | None = None
    suggested_space_name: str | None = None
    if best_profile.space.id != selected_profile.space.id and best_score >= selected_score + 0.05:
        suggested_space_id = best_profile.space.id
        suggested_space_name = best_profile.space.name

    document_signals = _document_signals(document_text, document.original_filename)
    profile_signals = _document_signals(selected_profile.text, selected_profile.space.name)
    shared_signals = [signal for signal in document_signals if signal in profile_signals]

    reasons: list[str] = []
    if name_mentioned:
        reasons.append(f"The asset explicitly mentions {selected_profile.space.name}.")
    if shared_signals:
        reasons.append(f"It shares {', '.join(shared_signals)} business themes with this project.")
    elif document_signals:
        reasons.append(f"The asset is mainly about {', '.join(document_signals)}, which is not strongly represented in this project.")
    if overlap_count >= 8:
        reasons.append("Several project-specific topics and terms overlap with saved knowledge.")
    elif overlap_count >= 3:
        reasons.append("There is some overlap with saved project knowledge, but not enough to rely on by itself.")
    else:
        reasons.append("Very little project-specific knowledge overlaps with this asset.")
    if semantic >= 0.64:
        reasons.append("Its overall meaning is close to the selected project's saved knowledge.")
    elif semantic < 0.52:
        reasons.append("Its overall meaning is different from the selected project's saved knowledge.")
    if suggested_space_name:
        reasons.append(f"Another existing project, {suggested_space_name}, is a stronger match.")

    suggested_new_space_name: str | None = None
    if level == "low" and suggested_space_id is None:
        suggested_new_space_name = _suggest_new_space_name(document_text, document.original_filename)

    target_name = selected_profile.space.name
    if level == "high":
        recommendation = f"This asset looks relevant to {target_name}."
    elif level == "medium":
        recommendation = f"The fit with {target_name} is uncertain. Review it before adding it to long-term project memory."
    else:
        recommendation = f"This asset does not strongly match {target_name}. Choose another project or keep it outside project memory."

    return {
        "document_id": document.id,
        "company_id": company_id,
        "company_name": company.name,
        "level": level,
        "confidence": confidence,
        "recommendation": recommendation,
        "reasons": reasons[:4],
        "suggested_company_id": None,
        "suggested_company_name": None,
        "target_space_id": selected_profile.space.id,
        "target_space_name": selected_profile.space.name,
        "suggested_space_id": suggested_space_id,
        "suggested_space_name": suggested_space_name,
        "suggested_new_space_name": suggested_new_space_name,
        "method": "project_semantic_embeddings_with_rules",
    }
