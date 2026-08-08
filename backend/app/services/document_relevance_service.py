from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

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
    return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if len(token) > 2 and token not in _STOP_WORDS}


def _space_profile(database: Session, space: KnowledgeSpace) -> _SpaceProfile:
    items = list(database.scalars(
        select(KnowledgeItem).where(KnowledgeItem.space_id == space.id).order_by(KnowledgeItem.created_at.desc()).limit(18)
    ).all())
    parts = [f"Project: {space.name}", space.description or "", *[f"{item.item_type}: {item.title}. {item.summary}" for item in items]]
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
    if any(term in lowered for term in ("curriculum vitae", "resume", "candidate", "employment history", "skills")):
        return "Recruitment"
    if any(term in lowered for term in ("supplier", "quotation", "purchase order", "procurement")):
        return "Suppliers & Procurement"
    if any(term in lowered for term in ("invoice", "cashflow", "profit", "revenue", "expense", "receipt")):
        return "Finance"
    if any(term in lowered for term in ("campaign", "brand", "marketing", "social media")):
        return "Marketing"
    if any(term in lowered for term in ("research", "competitor", "market analysis", "survey")):
        return "Research"
    if any(term in lowered for term in ("meeting", "minutes", "agenda")):
        return "Meetings"
    return "New Project"


def _confidence(score: float, mentioned: bool) -> int:
    value = round(max(5, min(97, (score - 0.34) * 135)))
    return max(value, 90) if mentioned else value


def assess_document_relevance(database: Session, company_id: int, document_id: int, target_space_id: int | None = None) -> dict[str, object]:
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

    spaces = list(database.scalars(select(KnowledgeSpace).where(
        KnowledgeSpace.company_id == company_id, KnowledgeSpace.is_archived.is_(False)
    ).order_by(KnowledgeSpace.updated_at.desc()).limit(30)).all())

    target_space = None
    if target_space_id is not None:
        target_space = database.get(KnowledgeSpace, target_space_id)
        if target_space is None or target_space.company_id != company_id or target_space.is_archived:
            raise ValueError("Target project not found")

    suggested_new = _suggest_new_space_name(document_text, document.original_filename)
    if not spaces:
        return {
            "document_id": document.id, "company_id": company_id, "company_name": company.name,
            "level": "low", "confidence": 10, "target_confidence": 10,
            "recommendation": "There is no existing project with enough knowledge for a reliable comparison.",
            "reasons": ["GrowthOS has no project-specific knowledge to compare this asset with.", f"Its content is most consistent with a project such as {suggested_new}."],
            "suggested_company_id": None, "suggested_company_name": None,
            "target_space_id": None, "target_space_name": None, "suggested_space_id": None, "suggested_space_name": None,
            "suggested_new_space_name": suggested_new, "best_space_id": None, "best_space_name": None,
            "best_confidence": None, "best_is_stronger": False, "no_confident_existing_match": True,
            "method": "project_semantic_embeddings_with_rules",
        }

    profiles = [_space_profile(database, space) for space in spaces]
    query_embedding = create_query_embedding(document_text)
    profile_embeddings = create_embeddings(profile.text for profile in profiles)
    document_tokens = _tokens(document_text)
    lowered_document = f"{document.original_filename} {document_text}".lower()
    is_image = Path(document.original_filename).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

    scored = []
    for profile, embedding in zip(profiles, profile_embeddings, strict=False):
        semantic = cosine_similarity_score(query_embedding, embedding)
        overlap_count = len(document_tokens & _tokens(profile.text))
        mentioned = profile.space.name.lower() in lowered_document
        score = semantic + min(0.08, overlap_count * 0.006) + (0.16 if mentioned else 0.0)
        scored.append((score, profile, semantic, overlap_count, mentioned))
    scored.sort(key=lambda row: row[0], reverse=True)

    best_row = scored[0]
    selected_row = next((row for row in scored if target_space and row[1].space.id == target_space.id), None) if target_space else best_row
    selected_row = selected_row or best_row

    selected_score, selected_profile, selected_semantic, overlap_count, selected_mentioned = selected_row
    best_score, best_profile, _, _, best_mentioned = best_row
    target_conf = _confidence(selected_score, selected_mentioned)
    best_conf = _confidence(best_score, best_mentioned)

    # Metadata-only images must not become high-confidence business matches simply because generic metadata overlaps.
    if is_image and len(document_text) < 700:
        target_conf = min(target_conf, 35)
        best_conf = min(best_conf, 42)

    best_is_stronger = best_profile.space.id != selected_profile.space.id and best_conf >= target_conf + 8
    no_confident_existing_match = best_conf < 55

    if target_conf >= 72 and not best_is_stronger:
        level = "high"
    elif target_conf >= 52 and not (best_is_stronger and best_conf >= 65):
        level = "medium"
    else:
        level = "low"

    suggested_space_id = best_profile.space.id if best_is_stronger else None
    suggested_space_name = best_profile.space.name if best_is_stronger else None

    doc_signals = _document_signals(document_text, document.original_filename)
    target_signals = _document_signals(selected_profile.text, selected_profile.space.name)
    shared = [signal for signal in doc_signals if signal in target_signals]
    reasons: list[str] = []
    if selected_mentioned:
        reasons.append(f"The asset explicitly mentions {selected_profile.space.name}.")
    if shared:
        reasons.append(f"It shares {', '.join(shared)} business themes with {selected_profile.space.name}.")
    elif doc_signals:
        reasons.append(f"The asset is mainly about {', '.join(doc_signals)}, which is not strongly represented in {selected_profile.space.name}.")
    if overlap_count >= 8:
        reasons.append("Several project-specific topics overlap with saved knowledge.")
    elif overlap_count >= 3:
        reasons.append("Some project-specific knowledge overlaps with the asset, but the evidence is limited.")
    else:
        reasons.append("Very little project-specific knowledge overlaps with this asset.")
    if is_image and len(document_text) < 700:
        reasons.append("Only image metadata or limited extracted text is available, so GrowthOS is deliberately cautious.")
    elif selected_semantic >= 0.64:
        reasons.append("Its overall meaning is close to the selected project's saved knowledge.")
    elif selected_semantic < 0.52:
        reasons.append("Its overall meaning differs from the selected project's saved knowledge.")
    if best_is_stronger:
        reasons.append(f"{best_profile.space.name} is a stronger existing match ({best_conf}%) than {selected_profile.space.name} ({target_conf}%).")

    if best_is_stronger:
        recommendation = f"{selected_profile.space.name} is only a {target_conf}% match. {best_profile.space.name} is stronger at {best_conf}%."
    elif no_confident_existing_match:
        recommendation = f"No existing project is a confident match. Review the destination before adding this asset to long-term project memory."
    elif level == "high":
        recommendation = f"This asset is a strong match for {selected_profile.space.name}."
    elif level == "medium":
        recommendation = f"{selected_profile.space.name} is a possible match, but GrowthOS recommends a quick review."
    else:
        recommendation = f"This asset does not strongly match {selected_profile.space.name}."

    return {
        "document_id": document.id, "company_id": company_id, "company_name": company.name,
        "level": level, "confidence": target_conf, "target_confidence": target_conf,
        "recommendation": recommendation, "reasons": reasons[:5],
        "suggested_company_id": None, "suggested_company_name": None,
        "target_space_id": selected_profile.space.id, "target_space_name": selected_profile.space.name,
        "suggested_space_id": suggested_space_id, "suggested_space_name": suggested_space_name,
        "suggested_new_space_name": suggested_new if no_confident_existing_match else None,
        "best_space_id": best_profile.space.id, "best_space_name": best_profile.space.name,
        "best_confidence": best_conf, "best_is_stronger": best_is_stronger,
        "no_confident_existing_match": no_confident_existing_match,
        "method": "project_semantic_embeddings_with_rules",
    }
