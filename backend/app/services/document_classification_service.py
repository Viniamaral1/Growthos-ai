from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.document_chunk import DocumentChunk


_CATEGORY_TERMS: dict[str, tuple[str, ...]] = {
    "finance": (
        "price", "pricing", "revenue", "cost", "margin", "cash",
        "runway", "budget", "forecast", "profit", "financial",
    ),
    "marketing": (
        "marketing", "campaign", "brand", "positioning", "audience",
        "customer", "acquisition", "conversion", "channel", "content",
    ),
    "operations": (
        "operations", "workflow", "process", "sop", "delivery",
        "implementation", "owner", "deadline", "capacity", "bottleneck",
    ),
    "research": (
        "research", "evidence", "interview", "survey", "validation",
        "assumption", "experiment", "confidence", "hypothesis",
    ),
    "strategy": (
        "strategy", "vision", "priority", "roadmap", "market",
        "business model", "competitive", "opportunity", "growth plan",
    ),
}

_EXECUTIVES = {
    "finance": "cfo",
    "marketing": "cmo",
    "operations": "coo",
    "research": "research",
    "strategy": "ceo",
    "general": "ceo",
}


def classify_document(
    database: Session,
    document: Document,
) -> dict[str, object]:
    """Classify a processed document from extracted chunk text."""

    chunks = database.scalars(
        select(DocumentChunk)
        .where(
            DocumentChunk.document_id == document.id
        )
        .order_by(DocumentChunk.id.asc())
        .limit(8)
    ).all()

    text = " ".join(
        chunk.text for chunk in chunks
    ).lower()

    if not text.strip():
        return {
            "document_id": document.id,
            "category": "general",
            "suggested_executive": "ceo",
            "confidence": 30,
            "signals": ["No extracted text available"],
        }

    scores = Counter()

    for category, terms in _CATEGORY_TERMS.items():
        scores[category] = sum(
            text.count(term)
            for term in terms
        )

    category, best_score = max(
        scores.items(),
        key=lambda item: item[1],
    )

    if best_score <= 0:
        category = "general"

    total = sum(scores.values())

    confidence = (
        35
        if total <= 0
        else min(
            95,
            50 + int(
                (best_score / max(total, 1)) * 45
            ),
        )
    )

    signals = [
        term
        for term in _CATEGORY_TERMS.get(
            category,
            (),
        )
        if term in text
    ][:4]

    return {
        "document_id": document.id,
        "category": category,
        "suggested_executive": _EXECUTIVES[
            category
        ],
        "confidence": confidence,
        "signals": (
            signals
            or ["General business content"]
        ),
    }
