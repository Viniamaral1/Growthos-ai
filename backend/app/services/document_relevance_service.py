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
    "finance": ("invoice", "revenue", "expense", "profit", "budget", "cashflow", "payment", "price", "receipt"),
    "research": ("research", "market", "competitor", "survey", "evidence", "analysis"),
    "operations": ("operations", "process", "delivery", "warehouse", "inventory", "compliance"),
    "marketing": ("marketing", "campaign", "brand", "audience", "social", "lead"),
}

_DOMAIN_GROUPS: dict[str, tuple[str, ...]] = {
    "aquaculture": ("aquaculture", "salmon", "fish farming", "fish farm", "water quality", "oxygen sensor", "tank"),
    "livestock / meat": ("meat", "beef", "poultry", "livestock", "butcher", "slaughter", "cold storage"),
    "recruitment / hr": ("curriculum vitae", "resume", "candidate", "employment history", "recruitment", "human resources"),
    "software / technology": ("software", "developer", "machine learning", "artificial intelligence", "computer vision", "saas", "api"),
    "finance / accounting": ("finance", "accounting", "invoice", "cashflow", "profit and loss", "balance sheet", "receipt"),
    "retail": ("retail", "store", "merchandising", "consumer", "shop", "point of sale"),
    "legal / compliance": ("legal", "regulatory", "compliance", "legislation", "policy", "audit"),
    "sustainability / esg": ("sustainability", "esg", "carbon", "co2", "renewable energy", "environmental"),
}

_DOCUMENT_KIND_GROUPS: dict[str, tuple[str, ...]] = {
    "contract": ("contract", "agreement", "terms and conditions"),
    "quotation": ("quotation", "quote", "proposal", "pricing"),
    "invoice / receipt": ("invoice", "receipt", "amount due"),
    "cv / candidate": ("curriculum vitae", "resume", "candidate", "employment history"),
    "meeting": ("meeting minutes", "minutes", "agenda", "attendees"),
    "audit / report": ("audit", "report", "findings", "recommendations"),
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
        select(KnowledgeItem).where(KnowledgeItem.space_id == space.id).order_by(KnowledgeItem.created_at.desc()).limit(24)
    ).all())
    parts = [f"Project: {space.name}", space.description or "", *[f"{item.item_type}: {item.title}. {item.summary}" for item in items]]
    return _SpaceProfile(space=space, text=_clip("\n".join(parts), 6200))


def _matched_groups(value: str, groups: dict[str, tuple[str, ...]], minimum_hits: int = 1) -> list[str]:
    lowered = value.lower()
    output: list[str] = []
    for label, words in groups.items():
        hits = sum(1 for word in words if word in lowered)
        if hits >= minimum_hits:
            output.append(label)
    return output


def _document_signals(text: str, filename: str) -> list[str]:
    return _matched_groups(f"{filename} {text}", _SIGNAL_GROUPS, minimum_hits=2)[:3]


def _domains(text: str, filename: str = "") -> list[str]:
    return _matched_groups(f"{filename} {text}", _DOMAIN_GROUPS, minimum_hits=1)[:4]


def _document_kinds(text: str, filename: str = "") -> list[str]:
    return _matched_groups(f"{filename} {text}", _DOCUMENT_KIND_GROUPS, minimum_hits=1)[:3]


def _suggest_new_space_name(text: str, filename: str) -> str:
    domains = _domains(text, filename)
    if "aquaculture" in domains:
        return "Aquaculture & Sustainability"
    if "recruitment / hr" in domains:
        return "Recruitment"
    lowered = f"{filename} {text}".lower()
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
    if domains:
        return domains[0].title()
    return "New Project"


def _positive_space_mention(text: str, space_name: str) -> tuple[bool, bool]:
    """Return (positive_mention, negative_context_mention).

    Test/demo documents sometimes literally say "unrelated to Meat Farm". That must never
    become a 90% match merely because the project name appears in the text.
    """
    lowered = text.lower()
    name = space_name.lower().strip()
    if not name or name not in lowered:
        return False, False
    negative_patterns = [
        rf"unrelated\s+to\s+{re.escape(name)}",
        rf"does\s+not\s+(?:belong|relate)\s+to\s+{re.escape(name)}",
        rf"not\s+(?:for|about|related\s+to)\s+{re.escape(name)}",
        rf"rather\s+than\s+{re.escape(name)}",
        rf"instead\s+of\s+{re.escape(name)}",
    ]
    negative = any(re.search(pattern, lowered) for pattern in negative_patterns)
    return (not negative), negative


def _named_entity_overlap(document_text: str, profile_text: str) -> int:
    pattern = r"\b[A-Z][A-Za-z0-9&'.,-]*(?:\s+[A-Z][A-Za-z0-9&'.,-]*){0,4}\s(?:Ltd|Limited|LLC|Inc\.?|PLC|Corp\.?|GmbH|LLP)\b"
    doc_entities = {match.group(0).lower() for match in re.finditer(pattern, document_text)}
    profile_entities = {match.group(0).lower() for match in re.finditer(pattern, profile_text)}
    return len(doc_entities & profile_entities)


def _component_score(
    *,
    semantic: float,
    overlap_count: int,
    positive_mention: bool,
    negative_mention: bool,
    named_entity_overlap: int,
    doc_domains: list[str],
    profile_domains: list[str],
    doc_kinds: list[str],
    profile_kinds: list[str],
    metadata_only_image: bool,
) -> tuple[int, dict[str, int], list[str]]:
    semantic_points = max(0, min(35, round((semantic - 0.36) * 82)))
    topic_points = max(0, min(20, overlap_count * 2))
    entity_points = 20 if positive_mention else min(16, named_entity_overlap * 8)

    penalties: list[str] = []
    penalty_points = 0

    if doc_domains and profile_domains:
        shared_domains = set(doc_domains) & set(profile_domains)
        if shared_domains:
            domain_points = 15
        else:
            domain_points = 0
            penalty_points += 15
            penalties.append("Industry/domain mismatch -15%")
    elif doc_domains:
        domain_points = 5
    else:
        domain_points = 4

    if doc_kinds and profile_kinds and set(doc_kinds) & set(profile_kinds):
        kind_points = 10
    elif doc_kinds:
        kind_points = 5
    else:
        kind_points = 3

    if negative_mention:
        penalty_points += 35
        penalties.append("Project name appears in negative/unrelated context -35%")
    if metadata_only_image:
        penalty_points += 18
        penalties.append("Limited image text/metadata only -18%")

    score = semantic_points + topic_points + entity_points + domain_points + kind_points - penalty_points
    score = max(5, min(97, score))
    breakdown = {
        "semantic_similarity": semantic_points,
        "topic_overlap": topic_points,
        "named_entities": entity_points,
        "domain_alignment": domain_points,
        "document_type": kind_points,
        "penalties": -penalty_points,
    }
    return score, breakdown, penalties


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

    document_text = _clip(document.extracted_text, 3600)
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
    doc_domains = _domains(document_text, document.original_filename)
    doc_kinds = _document_kinds(document_text, document.original_filename)

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
            "confidence_breakdown": {"semantic_similarity": 0, "topic_overlap": 0, "named_entities": 0, "domain_alignment": 0, "document_type": 0, "penalties": 0},
            "detected_domains": doc_domains, "project_domains": [], "penalties": [],
            "method": "explainable_project_matching_v2",
        }

    profiles = [_space_profile(database, space) for space in spaces]
    query_embedding = create_query_embedding(document_text)
    profile_embeddings = create_embeddings(profile.text for profile in profiles)
    document_tokens = _tokens(document_text)
    is_image = Path(document.original_filename).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    metadata_only_image = is_image and len(document_text) < 700

    scored: list[dict[str, object]] = []
    for profile, embedding in zip(profiles, profile_embeddings, strict=False):
        semantic = cosine_similarity_score(query_embedding, embedding)
        overlap_count = len(document_tokens & _tokens(profile.text))
        positive_mention, negative_mention = _positive_space_mention(f"{document.original_filename} {document_text}", profile.space.name)
        entity_overlap = _named_entity_overlap(document_text, profile.text)
        profile_domains = _domains(profile.text, profile.space.name)
        profile_kinds = _document_kinds(profile.text, profile.space.name)
        score, breakdown, penalties = _component_score(
            semantic=semantic,
            overlap_count=overlap_count,
            positive_mention=positive_mention,
            negative_mention=negative_mention,
            named_entity_overlap=entity_overlap,
            doc_domains=doc_domains,
            profile_domains=profile_domains,
            doc_kinds=doc_kinds,
            profile_kinds=profile_kinds,
            metadata_only_image=metadata_only_image,
        )
        scored.append({
            "score": score,
            "profile": profile,
            "semantic": semantic,
            "overlap_count": overlap_count,
            "positive_mention": positive_mention,
            "negative_mention": negative_mention,
            "entity_overlap": entity_overlap,
            "profile_domains": profile_domains,
            "profile_kinds": profile_kinds,
            "breakdown": breakdown,
            "penalties": penalties,
        })
    scored.sort(key=lambda row: int(row["score"]), reverse=True)

    best_row = scored[0]
    if target_space is not None:
        selected_row = next((row for row in scored if row["profile"].space.id == target_space.id), best_row)  # type: ignore[index]
    else:
        selected_row = best_row

    selected_profile = selected_row["profile"]  # type: ignore[assignment]
    best_profile = best_row["profile"]  # type: ignore[assignment]
    target_conf = int(selected_row["score"])
    best_conf = int(best_row["score"])
    overlap_count = int(selected_row["overlap_count"])
    selected_semantic = float(selected_row["semantic"])
    selected_mentioned = bool(selected_row["positive_mention"])
    target_profile_domains = list(selected_row["profile_domains"])

    best_is_stronger = best_profile.space.id != selected_profile.space.id and best_conf >= target_conf + 8
    no_confident_existing_match = best_conf < 58

    if target_conf >= 75 and not best_is_stronger:
        level = "high"
    elif target_conf >= 55 and not (best_is_stronger and best_conf >= 68):
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
        reasons.append(f"The asset explicitly refers to {selected_profile.space.name} in a relevant context.")
    if doc_domains and target_profile_domains:
        shared_domains = [domain for domain in doc_domains if domain in target_profile_domains]
        if shared_domains:
            reasons.append(f"Domain alignment: {', '.join(shared_domains)}.")
        else:
            reasons.append(f"Its detected domain ({', '.join(doc_domains)}) does not strongly match {selected_profile.space.name} ({', '.join(target_profile_domains)}).")
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
    if metadata_only_image:
        reasons.append("Only image metadata or limited extracted text is available, so GrowthOS is deliberately cautious.")
    elif selected_semantic >= 0.64:
        reasons.append("Its overall meaning is close to the selected project's saved knowledge.")
    elif selected_semantic < 0.52:
        reasons.append("Its overall meaning differs from the selected project's saved knowledge.")
    if best_is_stronger:
        reasons.append(f"{best_profile.space.name} is a stronger existing match ({best_conf}%) than {selected_profile.space.name} ({target_conf}%).")

    if best_is_stronger:
        recommendation = f"{selected_profile.space.name} is a {target_conf}% match, but {best_profile.space.name} is stronger at {best_conf}%."
    elif no_confident_existing_match:
        recommendation = "No existing project is a confident match. Review the destination before adding this asset to long-term project memory."
    elif level == "high":
        recommendation = f"This asset is a strong match for {selected_profile.space.name}."
    elif level == "medium":
        recommendation = f"{selected_profile.space.name} is a possible match, but GrowthOS recommends a quick review."
    else:
        recommendation = f"This asset does not strongly match {selected_profile.space.name}."

    return {
        "document_id": document.id, "company_id": company_id, "company_name": company.name,
        "level": level, "confidence": target_conf, "target_confidence": target_conf,
        "recommendation": recommendation, "reasons": reasons[:6],
        "suggested_company_id": None, "suggested_company_name": None,
        "target_space_id": selected_profile.space.id, "target_space_name": selected_profile.space.name,
        "suggested_space_id": suggested_space_id, "suggested_space_name": suggested_space_name,
        "suggested_new_space_name": suggested_new if no_confident_existing_match else None,
        "best_space_id": best_profile.space.id, "best_space_name": best_profile.space.name,
        "best_confidence": best_conf, "best_is_stronger": best_is_stronger,
        "no_confident_existing_match": no_confident_existing_match,
        "confidence_breakdown": dict(selected_row["breakdown"]),
        "detected_domains": doc_domains,
        "project_domains": target_profile_domains,
        "penalties": list(selected_row["penalties"]),
        "method": "explainable_project_matching_v2",
    }
