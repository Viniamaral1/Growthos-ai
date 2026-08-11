from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.models.opportunity import OpportunityRecord


@dataclass(frozen=True)
class Candidate:
    signature: str
    opportunity_type: str
    title: str
    summary: str
    confidence: int
    severity: str
    space_id: int | None
    space_name: str | None
    current_value: str | None
    previous_value: str | None
    delta_display: str | None
    delta_percent: float | None
    explanation: list[str]
    recommended_action: str
    entities: list[str]
    evidence: list[dict]


def _tags(item: KnowledgeItem) -> list[str]:
    try:
        raw = json.loads(item.tags_json or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return [tag for tag in raw if isinstance(tag, str)]


def _decode_tag(tag: str, prefix: str) -> str | None:
    marker = f"{prefix}:"
    if not tag.startswith(marker):
        return None
    encoded = tag[len(marker):]
    try:
        encoded += "=" * (-len(encoded) % 4)
        return base64.urlsafe_b64decode(encoded.encode()).decode("utf-8")
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None


def _tag_value(tags: list[str], prefix: str) -> str | None:
    marker = f"{prefix}:"
    return next((tag[len(marker):] for tag in reversed(tags) if tag.startswith(marker)), None)


def _decoded_values(tags: list[str], prefix: str) -> list[str]:
    values: list[str] = []
    for tag in tags:
        value = _decode_tag(tag, prefix)
        if value and value not in values:
            values.append(value)
    return values


def _number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", value)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _pct(old: float | None, new: float | None) -> float | None:
    if old in (None, 0) or new is None:
        return None
    return (new - old) / old * 100.0


def _pretty_percent(value: float | None) -> str | None:
    if value is None:
        return None
    return f"{value:+.1f}%"


def _source_evidence(database: Session, item: KnowledgeItem, tags: list[str]) -> list[dict]:
    source_ids: list[int] = []
    for tag in tags:
        if tag.startswith("source-document:"):
            try:
                source_ids.append(int(tag.split(":", 1)[1]))
            except ValueError:
                pass
    evidence: list[dict] = []
    for document_id in dict.fromkeys(source_ids):
        document = database.get(Document, document_id)
        evidence.append({
            "knowledge_item_id": item.id,
            "document_id": document_id,
            "document_name": document.original_filename if document else _tag_value(tags, "source-file"),
            "label": item.title,
            "value": item.content,
            "source_quality": _tag_value(tags, "source-quality") or "direct_document",
        })
    if not evidence:
        evidence.append({
            "knowledge_item_id": item.id,
            "document_id": None,
            "document_name": _tag_value(tags, "source-file"),
            "label": item.title,
            "value": item.content,
            "source_quality": _tag_value(tags, "source-quality") or "captured_knowledge",
        })
    return evidence


def _entities(item: KnowledgeItem, tags: list[str]) -> list[str]:
    result: list[str] = []
    if item.item_type in {"supplier", "customer", "organisation", "contact"}:
        result.append(item.content.strip())
    source = _tag_value(tags, "source-file")
    if source:
        result.append(source)
    return list(dict.fromkeys(value for value in result if value))[:6]


def _candidate_for_changed_fact(database: Session, item: KnowledgeItem, space: KnowledgeSpace | None) -> Candidate | None:
    tags = _tags(item)
    previous_values = _decoded_values(tags, "previous-value-b64")
    if not previous_values:
        return None
    previous = previous_values[-1]
    current = (item.content or "").strip()
    if not current or current.lower() == previous.lower():
        return None

    key = _tag_value(tags, "fact-key") or re.sub(r"\W+", "-", item.title.lower()).strip("-")
    confidence_raw = _tag_value(tags, "confidence")
    try:
        confidence = max(55, min(99, int(confidence_raw or 88)))
    except ValueError:
        confidence = 88

    old_num, new_num = _number(previous), _number(current)
    percent = _pct(old_num, new_num)
    lower = f"{item.title} {key} {previous} {current}".lower()

    opportunity_type = "material_change"
    severity = "info"
    title = f"{item.title} changed"
    recommended = "Review the new evidence and confirm whether the updated value should guide future decisions."
    explanation = [
        f"GrowthOS found a newer value for {item.title} in the same Knowledge project.",
        "The previous value was retained in Knowledge history rather than overwritten silently.",
    ]
    delta_display = _pretty_percent(percent)

    if any(token in lower for token in ("price", "/kg", "per kg", "unit cost", "rate")) and old_num is not None and new_num is not None:
        if new_num < old_num:
            opportunity_type = "supplier_price_reduction"
            severity = "positive"
            title = f"Potential saving: {item.title} decreased"
            recommended = "Review the updated quotation and compare the lower unit price against volume, quality and contract terms."
            explanation.append("The newer unit price is lower than the previously captured value.")
        else:
            opportunity_type = "supplier_price_increase"
            severity = "warning"
            title = f"Cost pressure: {item.title} increased"
            recommended = "Review the increase, compare alternative suppliers, and consider renegotiating before the next order or renewal."
            explanation.append("The newer unit price is higher than the previously captured value.")
    elif any(token in lower for token in ("annual contract value", "annual / commercial value", "commercial value", "annual value")) and old_num is not None and new_num is not None:
        if new_num < old_num:
            opportunity_type = "commercial_value_reduction"
            severity = "positive"
            title = f"Commercial saving detected in {item.title}"
            recommended = "Validate whether the lower annual commitment represents a real saving or reflects changed volume/scope."
        else:
            opportunity_type = "material_financial_increase"
            severity = "warning"
            title = f"Material financial increase in {item.title}"
            recommended = "Review what changed in volume, scope or pricing before approving the higher commitment."
    elif "payment terms" in lower and old_num is not None and new_num is not None:
        if new_num > old_num:
            opportunity_type = "better_payment_terms"
            severity = "positive"
            title = "Improved buyer payment window"
            recommended = "Confirm the longer payment window is reflected in the final agreement and cash-flow plan."
        else:
            opportunity_type = "worsening_payment_terms"
            severity = "warning"
            title = "Shorter payment window detected"
            recommended = "Review the cash-flow impact and consider negotiating the previous payment terms."
        delta_display = f"{abs(new_num-old_num):.0f} days {'longer' if new_num > old_num else 'shorter'}"
    elif any(token in lower for token in ("volume", "minimum order", "quantity")) and old_num is not None and new_num is not None:
        opportunity_type = "volume_change"
        severity = "info"
        title = f"Volume commitment changed: {item.title}"
        recommended = "Compare the volume change with unit pricing and expected demand before treating it as a saving."
    elif item.item_type == "date" or any(token in lower for token in ("renewal", "valid until", "expiry", "review date")):
        opportunity_type = "commercial_date_change"
        title = f"Commercial date changed: {item.title}"
        delta_display = None
        percent = None
        recommended = "Review whether this date affects renewal, negotiation, approval or reminder timing."
    elif item.item_type == "contract" or any(token in key for token in ("quotation-id", "quote-id", "reference", "contract-id")):
        opportunity_type = "superseded_reference"
        title = f"New commercial reference detected: {item.title}"
        delta_display = None
        percent = None
        recommended = "Confirm whether the new reference supersedes the previous quotation or contract record."

    signature_text = f"{item.company_id}|{item.space_id}|{opportunity_type}|{key}|{previous}|{current}"
    signature = hashlib.sha256(signature_text.encode()).hexdigest()[:40]
    evidence = _source_evidence(database, item, tags)

    return Candidate(
        signature=signature,
        opportunity_type=opportunity_type,
        title=title,
        summary=f"{item.title} changed from {previous} to {current}.",
        confidence=confidence,
        severity=severity,
        space_id=item.space_id,
        space_name=space.name if space else None,
        current_value=current,
        previous_value=previous,
        delta_display=delta_display,
        delta_percent=percent,
        explanation=explanation,
        recommended_action=recommended,
        entities=_entities(item, tags),
        evidence=evidence,
    )


def detect_opportunities(database: Session, company_id: int, space_id: int | None = None) -> list[OpportunityRecord]:
    statement = select(KnowledgeItem).where(KnowledgeItem.company_id == company_id)
    if space_id is not None:
        statement = statement.where(KnowledgeItem.space_id == space_id)
    items = list(database.scalars(statement.order_by(KnowledgeItem.updated_at.desc())).all())
    spaces = {space.id: space for space in database.scalars(select(KnowledgeSpace).where(KnowledgeSpace.company_id == company_id)).all()}

    candidates = [candidate for item in items if (candidate := _candidate_for_changed_fact(database, item, spaces.get(item.space_id))) is not None]

    # Cross-fact opportunity: unit price down while volume rises in the same project.
    by_space: dict[int, list[Candidate]] = {}
    for candidate in candidates:
        if candidate.space_id is not None:
            by_space.setdefault(candidate.space_id, []).append(candidate)
    for sid, group in by_space.items():
        price_down = next((c for c in group if c.opportunity_type == "supplier_price_reduction"), None)
        volume_up = next((c for c in group if c.opportunity_type == "volume_change" and (c.delta_percent or 0) > 0), None)
        if price_down and volume_up:
            signature = hashlib.sha256(f"{company_id}|{sid}|volume-price-tradeoff|{price_down.signature}|{volume_up.signature}".encode()).hexdigest()[:40]
            candidates.append(Candidate(
                signature=signature,
                opportunity_type="volume_price_tradeoff",
                title="Lower unit price is paired with a higher volume commitment",
                summary="GrowthOS detected a lower unit price and a higher committed volume in the same project.",
                confidence=min(price_down.confidence, volume_up.confidence),
                severity="info",
                space_id=sid,
                space_name=spaces.get(sid).name if spaces.get(sid) else None,
                current_value=price_down.current_value,
                previous_value=price_down.previous_value,
                delta_display=price_down.delta_display,
                delta_percent=price_down.delta_percent,
                explanation=[
                    "The newer evidence lowers the unit price.",
                    "The same project also contains a higher volume commitment.",
                    "A lower unit price is not automatically a total saving when committed volume increases.",
                ],
                recommended_action="Compare total expected spend before accepting the apparent unit-price saving.",
                entities=list(dict.fromkeys(price_down.entities + volume_up.entities))[:8],
                evidence=price_down.evidence + volume_up.evidence,
            ))

    records: list[OpportunityRecord] = []
    for candidate in candidates:
        record = database.scalar(select(OpportunityRecord).where(
            OpportunityRecord.company_id == company_id,
            OpportunityRecord.signature == candidate.signature,
        ))
        payload = json.dumps(candidate.__dict__, ensure_ascii=False)
        if record is None:
            record = OpportunityRecord(
                company_id=company_id,
                space_id=candidate.space_id,
                signature=candidate.signature,
                status="detected",
                opportunity_type=candidate.opportunity_type,
                title=candidate.title,
                payload_json=payload,
            )
        else:
            record.space_id = candidate.space_id
            record.opportunity_type = candidate.opportunity_type
            record.title = candidate.title
            record.payload_json = payload
        database.add(record)
        records.append(record)
    database.commit()
    for record in records:
        database.refresh(record)
    return records


def serialize_opportunity(database: Session, record: OpportunityRecord) -> dict:
    try:
        payload = json.loads(record.payload_json)
    except (TypeError, json.JSONDecodeError):
        payload = {}
    space = database.get(KnowledgeSpace, record.space_id) if record.space_id else None
    return {
        "id": record.id,
        "company_id": record.company_id,
        "space_id": record.space_id,
        "space_name": space.name if space else payload.get("space_name"),
        "status": record.status,
        "opportunity_type": record.opportunity_type,
        "title": record.title,
        "summary": payload.get("summary", ""),
        "confidence": int(payload.get("confidence", 80)),
        "severity": payload.get("severity", "info"),
        "current_value": payload.get("current_value"),
        "previous_value": payload.get("previous_value"),
        "delta_display": payload.get("delta_display"),
        "delta_percent": payload.get("delta_percent"),
        "explanation": payload.get("explanation", []),
        "recommended_action": payload.get("recommended_action", "Review this change."),
        "entities": payload.get("entities", []),
        "evidence": payload.get("evidence", []),
        "detected_at": record.detected_at,
        "updated_at": record.updated_at,
    }
