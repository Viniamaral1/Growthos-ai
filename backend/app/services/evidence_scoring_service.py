from __future__ import annotations

import base64
import binascii
import json
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contradiction import ContradictionRecord
from app.models.document import Document
from app.models.knowledge_item import KnowledgeItem
from app.schemas.evidence_scoring import (
    EvidenceScoreFactor,
    EvidenceScoreItem,
    EvidenceScoreSummary,
    EvidenceSourceSummary,
)


def _safe_tags(item: KnowledgeItem) -> list[str]:
    try:
        value = json.loads(item.tags_json or "[]")
        return [entry for entry in value if isinstance(entry, str)]
    except Exception:
        return []


def _source_ids(tags: list[str]) -> list[int]:
    ids: list[int] = []
    for tag in tags:
        if not tag.startswith("source-document:"):
            continue
        try:
            value = int(tag.split(":", 1)[1])
        except ValueError:
            continue
        if value not in ids:
            ids.append(value)
    return ids


def _tag_value(tags: list[str], prefix: str) -> str | None:
    marker = prefix + ":"
    return next((tag[len(marker):] for tag in reversed(tags) if tag.startswith(marker)), None)


def _decode_tag(tags: list[str], prefix: str) -> str | None:
    encoded = _tag_value(tags, prefix)
    if not encoded:
        return None
    try:
        return base64.urlsafe_b64decode((encoded + "=" * (-len(encoded) % 4)).encode()).decode()
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None


def _classify_document(document: Document | None) -> str:
    if document is None:
        return "unknown"
    name = (document.original_filename or "").lower()
    text = (document.extracted_text or "").lower()
    combined = f"{name}\n{text[:5000]}"
    if "amendment" in name or "addendum" in name:
        return "amendment"
    if "invoice" in name:
        return "invoice"
    if "contract" in name or "agreement" in name or ("signed" in name and "scope" in name):
        return "contract"
    if "quote" in name or "quotation" in name:
        return "quotation"
    if "policy" in name:
        return "policy"
    if "meeting" in name or "minutes" in name:
        return "meeting"
    if "email" in name:
        return "email"
    if "plan" in name:
        return "plan"
    if "signed" in combined and "agreement" in combined:
        return "contract"
    return "document"


def _is_superseded(document: Document | None) -> bool:
    if document is None:
        return False
    text = f"{document.original_filename or ''}\n{document.extracted_text or ''}".lower()
    return any(
        phrase in text
        for phrase in (
            "status superseded",
            "document status superseded",
            "superseded by",
            "obsolete version",
            "no longer current",
        )
    )


def _authority_score(document: Document | None) -> int:
    if document is None:
        return 20
    if _is_superseded(document):
        return 15
    source_type = _classify_document(document)
    text = (document.extracted_text or "").lower()
    if source_type == "amendment" and any(word in text for word in ("signed", "approved", "executed")):
        return 100
    if source_type == "contract" and any(word in text for word in ("signed", "current", "executed")):
        return 96
    return {
        "contract": 90,
        "invoice": 86,
        "policy": 84,
        "quotation": 74,
        "plan": 62,
        "meeting": 54,
        "email": 48,
        "document": 44,
        "unknown": 20,
    }.get(source_type, 40)


def _source_quality_score(tags: list[str], has_document: bool, has_conversation: bool) -> tuple[int, str]:
    raw = (_tag_value(tags, "source-quality") or "").lower().replace("-", "_")
    if raw in {"direct_document", "direct", "verified_document"}:
        return 20, "Direct documentary evidence is attached to this Knowledge fact."
    if has_document:
        return 18, "The fact is grounded in an uploaded source document."
    if has_conversation:
        return 11, "The fact is grounded in a conversation rather than a formal document."
    return 6, "The fact has limited explicit provenance metadata."


def _recency_score(item: KnowledgeItem, documents: list[Document]) -> tuple[int, int | None, str]:
    timestamps = [item.updated_at, item.created_at]
    timestamps.extend(document.uploaded_at for document in documents if document.uploaded_at)
    timestamps = [value for value in timestamps if value is not None]
    if not timestamps:
        return 6, None, "No reliable evidence timestamp is available."
    latest = max(value if value.tzinfo else value.replace(tzinfo=timezone.utc) for value in timestamps)
    now = datetime.now(timezone.utc)
    age_days = max(0, (now - latest).days)
    if age_days <= 30:
        return 15, age_days, "Evidence is current (30 days old or newer)."
    if age_days <= 90:
        return 12, age_days, "Evidence is recent (within 90 days)."
    if age_days <= 365:
        return 8, age_days, "Evidence is older than 90 days and may need a freshness check."
    return 4, age_days, "Evidence is more than one year old and should be revalidated."


def _corroboration_score(source_count: int) -> tuple[int, str]:
    if source_count >= 3:
        return 20, f"{source_count} independent source documents support this fact."
    if source_count == 2:
        return 15, "Two source documents support this fact."
    if source_count == 1:
        return 9, "One direct source supports this fact; independent corroboration would strengthen it."
    return 3, "No direct source document is linked to this fact."


def _consistency_score(active: int, resolved: int) -> tuple[int, str]:
    if active >= 2:
        return 2, f"{active} active contradictions currently challenge this fact."
    if active == 1:
        return 7, "One active contradiction currently challenges this fact."
    if resolved > 0:
        return 13, "No active contradiction remains; previous conflicts have been reviewed."
    return 15, "No active contradiction currently challenges this fact."


def _level(score: int) -> str:
    if score >= 80:
        return "strong"
    if score >= 60:
        return "moderate"
    return "weak"


def _contradiction_links(records: list[ContradictionRecord]) -> tuple[dict[int, int], dict[int, int]]:
    active: dict[int, int] = defaultdict(int)
    resolved: dict[int, int] = defaultdict(int)
    for record in records:
        try:
            payload = json.loads(record.payload_json or "{}")
        except Exception:
            continue
        evidence = payload.get("evidence") or []
        knowledge_ids = {
            int(entry["knowledge_item_id"])
            for entry in evidence
            if isinstance(entry, dict) and entry.get("knowledge_item_id") is not None
        }
        for knowledge_id in knowledge_ids:
            if record.status in {"detected", "confirmed"}:
                active[knowledge_id] += 1
            else:
                resolved[knowledge_id] += 1
    return active, resolved


def score_evidence(db: Session, company_id: int, space_id: int | None = None) -> EvidenceScoreSummary:
    stmt = select(KnowledgeItem).where(KnowledgeItem.company_id == company_id)
    if space_id is not None:
        stmt = stmt.where(KnowledgeItem.space_id == space_id)
    items = list(db.scalars(stmt.order_by(KnowledgeItem.updated_at.desc(), KnowledgeItem.id.desc())).all())

    contradiction_stmt = select(ContradictionRecord).where(ContradictionRecord.company_id == company_id)
    if space_id is not None:
        contradiction_stmt = contradiction_stmt.where(ContradictionRecord.space_id == space_id)
    contradiction_records = list(db.scalars(contradiction_stmt).all())
    active_links, resolved_links = _contradiction_links(contradiction_records)

    scored: list[EvidenceScoreItem] = []
    stale_items = 0
    multi_source_items = 0

    for item in items:
        tags = _safe_tags(item)
        document_ids = _source_ids(tags)
        documents = [document for document_id in document_ids if (document := db.get(Document, document_id)) is not None]
        source_count = len({document.id for document in documents})
        if source_count >= 2:
            multi_source_items += 1

        authority_values = [_authority_score(document) for document in documents]
        best_authority = max(authority_values, default=20)
        authority_points = round(best_authority * 0.30)
        authority_detail = (
            f"Strongest source authority is {best_authority}/100 from {documents[authority_values.index(best_authority)].original_filename}."
            if documents and authority_values
            else "No formal document authority could be established."
        )

        quality_points, quality_detail = _source_quality_score(
            tags,
            has_document=bool(documents),
            has_conversation=item.source_conversation_id is not None or item.source_message_id is not None,
        )
        recency_points, age_days, recency_detail = _recency_score(item, documents)
        if age_days is not None and age_days > 365:
            stale_items += 1
        corroboration_points, corroboration_detail = _corroboration_score(source_count)
        active_count = active_links.get(item.id, 0)
        resolved_count = resolved_links.get(item.id, 0)
        consistency_points, consistency_detail = _consistency_score(active_count, resolved_count)

        overall = max(
            0,
            min(
                100,
                authority_points + quality_points + recency_points + corroboration_points + consistency_points,
            ),
        )

        factors = [
            EvidenceScoreFactor(key="authority", label="Source authority", score=authority_points, maximum=30, detail=authority_detail),
            EvidenceScoreFactor(key="quality", label="Source quality", score=quality_points, maximum=20, detail=quality_detail),
            EvidenceScoreFactor(key="recency", label="Evidence freshness", score=recency_points, maximum=15, detail=recency_detail),
            EvidenceScoreFactor(key="corroboration", label="Corroboration", score=corroboration_points, maximum=20, detail=corroboration_detail),
            EvidenceScoreFactor(key="consistency", label="Cross-source consistency", score=consistency_points, maximum=15, detail=consistency_detail),
        ]

        strengths: list[str] = []
        cautions: list[str] = []
        if best_authority >= 85:
            strengths.append("Backed by a high-authority business source.")
        if source_count >= 2:
            strengths.append(f"Corroborated by {source_count} separate source documents.")
        if active_count == 0:
            strengths.append("No active contradiction currently challenges this fact.")
        if source_count <= 1:
            cautions.append("Independent corroborating evidence is limited.")
        if active_count > 0:
            cautions.append(f"{active_count} active contradiction{'s' if active_count != 1 else ''} should be reviewed before relying on this fact.")
        if age_days is not None and age_days > 365:
            cautions.append("The evidence is more than one year old.")
        if any(_is_superseded(document) for document in documents):
            cautions.append("At least one linked source is marked superseded; verify the current source before relying on it.")

        level = _level(overall)
        recommendation = {
            "strong": "Suitable for routine decision support, while keeping the original evidence available for audit.",
            "moderate": "Usable with review. Add corroboration or resolve open conflicts before high-impact decisions.",
            "weak": "Do not rely on this fact for a material decision until stronger or more current evidence is captured.",
        }[level]

        sources = [
            EvidenceSourceSummary(
                document_id=document.id,
                document_name=document.original_filename,
                source_type=_classify_document(document),
                authority_score=_authority_score(document),
                is_current=not _is_superseded(document),
                is_superseded=_is_superseded(document),
            )
            for document in documents
        ]

        scored.append(
            EvidenceScoreItem(
                knowledge_item_id=item.id,
                space_id=item.space_id,
                title=item.title,
                value=(item.content or item.summary or "").strip(),
                overall_score=overall,
                level=level,
                source_count=source_count,
                active_contradictions=active_count,
                resolved_contradictions=resolved_count,
                age_days=age_days,
                factors=factors,
                sources=sources,
                strengths=strengths,
                cautions=cautions,
                recommendation=recommendation,
            )
        )

    scores = [item.overall_score for item in scored]
    return EvidenceScoreSummary(
        company_id=company_id,
        space_id=space_id,
        total_items=len(scored),
        strong_items=sum(1 for item in scored if item.level == "strong"),
        moderate_items=sum(1 for item in scored if item.level == "moderate"),
        weak_items=sum(1 for item in scored if item.level == "weak"),
        average_score=round(sum(scores) / len(scores)) if scores else None,
        active_contradictions=sum(1 for record in contradiction_records if record.status in {"detected", "confirmed"}),
        multi_source_items=multi_source_items,
        stale_items=stale_items,
        items=scored,
        explanation=(
            "Evidence score measures the quality of the evidence supporting a GrowthOS Knowledge fact. "
            "It is deterministic and auditable: source authority, provenance quality, freshness, corroboration and active contradictions are scored separately. "
            "It is not the same as model confidence or business impact."
        ),
    )
