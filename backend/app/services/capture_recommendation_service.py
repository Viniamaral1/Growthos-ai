from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.services.embedding_service import (
    cosine_similarity_score,
    create_embeddings,
    create_query_embedding,
)


_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "have", "i", "in", "is", "it", "of", "on", "or", "that",
    "the", "this", "to", "was", "we", "were", "what", "when", "where",
    "which", "with", "you", "your",
}

_TYPE_SIGNALS: dict[str, tuple[str, ...]] = {
    "email": ("subject", "dear", "kind regards", "sincerely", "recipient"),
    "decision": ("decision", "decided", "approved", "chosen", "we will"),
    "research": ("research", "evidence", "findings", "survey", "interview", "hypothesis"),
    "strategy": ("strategy", "roadmap", "positioning", "priority", "objective"),
    "task": ("task", "deadline", "owner", "next action", "to-do"),
    "idea": ("idea", "opportunity", "concept", "what if"),
    "note": ("summary", "notes", "overview"),
}

_DOMAIN_SIGNALS: dict[str, tuple[str, ...]] = {
    "recruitment": (
        "cv", "resume", "employment history", "work experience", "qualification",
        "candidate", "skills", "education", "career",
    ),
    "finance": (
        "revenue", "expense", "profit", "cash flow", "budget", "invoice",
        "price", "margin", "forecast",
    ),
    "marketing": (
        "campaign", "audience", "brand", "customer", "conversion", "channel",
        "content", "positioning",
    ),
    "operations": (
        "process", "workflow", "supplier", "delivery", "compliance", "capacity",
        "inventory", "operations",
    ),
    "research": (
        "research", "evidence", "survey", "interview", "findings", "market analysis",
        "validation",
    ),
    "strategy": (
        "strategy", "roadmap", "priority", "business model", "competitive",
        "growth plan", "vision",
    ),
}


@dataclass
class _SpaceCandidate:
    space: KnowledgeSpace
    profile: str
    recent_titles: list[str]


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 1 and token not in _STOP_WORDS
    }


def _negative_space_mention(content: str, space_name: str) -> bool:
    name = re.escape(space_name.strip())
    patterns = (
        rf"(nothing|not|unrelated|no relation|doesn['’]t relate|does not relate).{{0,45}}{name}",
        rf"{name}.{{0,45}}(nothing|not relevant|unrelated|no relation|doesn['’]t relate|does not relate)",
    )
    return any(re.search(pattern, content, flags=re.IGNORECASE) for pattern in patterns)


def _content_evidence(content: str, item_type: str) -> list[str]:
    lowered = content.lower()
    evidence: list[str] = []

    type_terms = [
        term for term in _TYPE_SIGNALS.get(item_type, ())
        if term in lowered
    ][:2]
    if type_terms:
        evidence.append(
            f"{item_type.title()} structure detected ({', '.join(type_terms)})"
        )

    for domain, terms in _DOMAIN_SIGNALS.items():
        matches = [term for term in terms if term in lowered][:3]
        if matches:
            evidence.append(
                f"{domain.title()} topics detected ({', '.join(matches)})"
            )
        if len(evidence) >= 3:
            break

    if not evidence:
        evidence.append("Reusable business content detected")
    return evidence


def recommend_capture_destination(
    database: Session,
    *,
    company_id: int,
    content: str,
    item_type: str,
    active_space_id: int | None,
) -> dict[str, object]:
    """Recommend a Knowledge Space using semantic AI plus deterministic safeguards."""

    spaces = list(database.scalars(
        select(KnowledgeSpace)
        .where(
            KnowledgeSpace.company_id == company_id,
            KnowledgeSpace.is_archived.is_(False),
        )
        .order_by(KnowledgeSpace.updated_at.desc())
        .limit(16)
    ).all())

    evidence = _content_evidence(content, item_type)

    if not spaces:
        return {
            "item_type": item_type,
            "suggested_space_id": None,
            "suggested_space_name": None,
            "confidence": 0,
            "reason": "No Knowledge Spaces are available yet.",
            "evidence": evidence,
            "similar_items": [],
            "method": "semantic_ai_with_rules",
        }

    candidates: list[_SpaceCandidate] = []
    for space in spaces:
        items = list(database.scalars(
            select(KnowledgeItem)
            .where(KnowledgeItem.space_id == space.id)
            .order_by(KnowledgeItem.created_at.desc())
            .limit(3)
        ).all())

        profile_parts = [
            space.name,
            space.description or "",
            *[
                " ".join(
                    part for part in (item.title, item.summary, item.item_type)
                    if part
                )
                for item in items
            ],
        ]
        candidates.append(
            _SpaceCandidate(
                space=space,
                profile="\n".join(profile_parts)[:1800],
                recent_titles=[item.title for item in items[:3]],
            )
        )

    query_embedding = create_query_embedding(content[:3000])
    profile_embeddings = create_embeddings(candidate.profile for candidate in candidates)
    content_tokens = _tokens(content)

    scored: list[tuple[float, _SpaceCandidate, int]] = []
    for candidate, profile_embedding in zip(candidates, profile_embeddings, strict=False):
        semantic = cosine_similarity_score(query_embedding, profile_embedding)
        name_tokens = _tokens(candidate.space.name)
        overlap = len(content_tokens & name_tokens)
        lexical_bonus = min(0.08, overlap * 0.04)
        active_bonus = 0.025 if candidate.space.id == active_space_id else 0.0
        negative_penalty = 0.45 if _negative_space_mention(content, candidate.space.name) else 0.0
        final_score = semantic + lexical_bonus + active_bonus - negative_penalty
        scored.append((final_score, candidate, overlap))

    scored.sort(key=lambda row: row[0], reverse=True)
    best_score, best, overlap = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0.0
    margin = best_score - second_score

    # Refuse to force a destination when the evidence is weak or ambiguous.
    if best_score < 0.43 or (best_score < 0.55 and margin < 0.035):
        return {
            "item_type": item_type,
            "suggested_space_id": None,
            "suggested_space_name": None,
            "confidence": max(20, min(58, round(best_score * 100))),
            "reason": "No Knowledge Space has a confident semantic match.",
            "evidence": evidence,
            "similar_items": [],
            "method": "semantic_ai_with_rules",
        }

    confidence = round(
        min(
            96,
            max(
                55,
                best_score * 88 + min(8, margin * 100),
            ),
        )
    )

    similar_items = best.recent_titles[:3]
    reason_parts = [f"Semantically similar to the {best.space.name} Knowledge Space"]
    if overlap:
        reason_parts.append("the space name also matches terms in the content")
    if similar_items:
        reason_parts.append(f"it resembles {len(similar_items)} existing item{'s' if len(similar_items) != 1 else ''}")

    grounded_evidence = list(evidence)
    if similar_items:
        grounded_evidence.append(
            "Similar saved items: " + ", ".join(similar_items)
        )

    return {
        "item_type": item_type,
        "suggested_space_id": best.space.id,
        "suggested_space_name": best.space.name,
        "confidence": confidence,
        "reason": "; ".join(reason_parts) + ".",
        "evidence": grounded_evidence[:4],
        "similar_items": similar_items,
        "method": "semantic_ai_with_rules",
    }
