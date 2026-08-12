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
from app.models.opportunity import OpportunityRecord, OpportunityReviewState


@dataclass(frozen=True)
class Candidate:
    signature: str
    opportunity_type: str
    title: str
    summary: str
    confidence: int
    confidence_factors: list[dict]
    severity: str
    space_id: int | None
    space_name: str | None
    current_value: str | None
    previous_value: str | None
    delta_display: str | None
    delta_percent: float | None
    explanation: list[str]
    business_impact: str
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


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_business_date(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    for fmt in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _source_ids(tags: list[str]) -> list[int]:
    result: list[int] = []
    for tag in tags:
        if tag.startswith("source-document:"):
            try:
                value = int(tag.split(":", 1)[1])
            except ValueError:
                continue
            if value not in result:
                result.append(value)
    return result


def _source_evidence(database: Session, item: KnowledgeItem, tags: list[str], previous_values: list[str] | None = None) -> list[dict]:
    """Build evidence snapshots without rewriting historical values as the current value.

    Knowledge keeps source ids in capture order and previous values in change order. When
    those histories line up, older documents are shown with the value they supported at
    that point in time. This avoids the v1 bug where every source displayed the latest value.
    """
    ids = _source_ids(tags)
    previous_values = list(previous_values or [])
    current = (item.content or "").strip()
    evidence: list[dict] = []

    if ids:
        # Map the oldest available source/value pairs to previous values. Any additional
        # middle sources are supporting evidence; the newest source is the current value.
        historical_count = min(len(previous_values), max(0, len(ids) - 1))
        historical_by_index: dict[int, str] = {}
        if historical_count:
            start = max(0, len(previous_values) - historical_count)
            for index in range(historical_count):
                historical_by_index[index] = previous_values[start + index]

        for index, document_id in enumerate(ids):
            document = database.get(Document, document_id)
            if index in historical_by_index:
                role = "historical"
                value = historical_by_index[index]
            elif index == len(ids) - 1:
                role = "current"
                value = current
            else:
                role = "supporting"
                value = current
            evidence.append({
                "knowledge_item_id": item.id,
                "document_id": document_id,
                "document_name": document.original_filename if document else _tag_value(tags, "source-file"),
                "label": item.title,
                "value": value,
                "source_quality": _tag_value(tags, "source-quality") or "direct_document",
                "role": role,
            })
    else:
        evidence.append({
            "knowledge_item_id": item.id,
            "document_id": None,
            "document_name": _tag_value(tags, "source-file"),
            "label": item.title,
            "value": current,
            "source_quality": _tag_value(tags, "source-quality") or "captured_knowledge",
            "role": "current",
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


def _confidence_factors(item: KnowledgeItem, tags: list[str], confidence: int, has_history: bool = True) -> list[dict]:
    factors: list[dict] = []
    if item.space_id:
        factors.append({"label": "Same project", "contribution": 15, "detail": "The evidence is being compared inside the same business project."})
    if _tag_value(tags, "fact-key"):
        factors.append({"label": "Same business fact", "contribution": 25, "detail": f"Both records describe {item.title}."})
    if has_history:
        factors.append({"label": "Historical match", "contribution": 20, "detail": "A previous value is preserved in Knowledge history."})
    if len(_source_ids(tags)) >= 2:
        factors.append({"label": "Multiple evidence sources", "contribution": 15, "detail": "More than one source document supports the comparison."})
    remaining = max(0, confidence - sum(f["contribution"] for f in factors))
    if remaining:
        factors.append({"label": "Evidence quality", "contribution": remaining, "detail": "Captured source quality and extraction confidence support the finding."})
    return factors


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
    summary = f"{item.title} changed from {previous} to {current}."
    recommended = "Review the updated evidence and decide whether this value should guide future decisions."
    explanation = [
        f"GrowthOS matched the latest {item.title} with the previous value stored in this project.",
        "The older value remains in Knowledge history so the change can be audited later.",
    ]
    business_impact = "The business record has changed. Review the new value before relying on it operationally."
    delta_display = _pretty_percent(percent)

    if any(token in lower for token in ("price", "/kg", "per kg", "unit cost", "rate")) and old_num is not None and new_num is not None:
        change = new_num - old_num
        if new_num < old_num:
            opportunity_type = "supplier_price_reduction"
            severity = "positive"
            title = f"Potential saving: {item.title} decreased"
            summary = f"{item.title} decreased from {previous} to {current} ({_pretty_percent(percent)})."
            recommended = "Review the revised quotation against expected volume, supplier quality and contract terms before accepting the lower price."
            explanation = [
                f"The latest {item.title} is {abs(change):.2f} lower than the previous captured value.",
                f"That represents an approximate {abs(percent or 0):.1f}% unit-price reduction.",
                "GrowthOS preserved both source values so the saving can be verified against the original evidence.",
            ]
            business_impact = "Potential purchasing saving. Confirm that the lower unit price is not offset by higher volume, reduced quality, or less favourable contract terms."
        else:
            opportunity_type = "supplier_price_increase"
            severity = "warning"
            title = f"Cost pressure: {item.title} increased"
            summary = f"{item.title} increased from {previous} to {current} ({_pretty_percent(percent)})."
            recommended = "Review the increase, compare alternative suppliers, and consider renegotiating before the next order or renewal."
            explanation = [
                f"The latest {item.title} is {abs(change):.2f} higher than the previous captured value.",
                f"That represents an approximate {abs(percent or 0):.1f}% unit-price increase.",
            ]
            business_impact = "Possible margin pressure or higher purchasing cost. The change may warrant negotiation or supplier comparison."
    elif any(token in lower for token in ("annual contract value", "annual / commercial value", "commercial value", "annual value")) and old_num is not None and new_num is not None:
        diff = new_num - old_num
        if new_num < old_num:
            opportunity_type = "commercial_value_reduction"
            severity = "positive"
            title = f"Commercial commitment reduced: {item.title}"
            recommended = "Validate whether the lower annual commitment is a true saving or reflects reduced volume or scope."
            business_impact = "Potential reduction in annual spend, subject to confirming that scope and volume remain comparable."
        else:
            opportunity_type = "material_financial_increase"
            severity = "warning"
            title = f"Material financial increase in {item.title}"
            recommended = "Review changes in volume, scope and unit pricing before approving the higher commitment."
            business_impact = "Higher annual commitment. Confirm whether the increase is justified by additional volume, scope or service value."
        explanation = [
            f"The annual commercial value moved from {previous} to {current}.",
            f"The numerical movement is {abs(diff):,.0f} ({abs(percent or 0):.1f}%).",
            "Annual value should be interpreted alongside volume and unit-price changes rather than in isolation.",
        ]
    elif "payment terms" in lower and old_num is not None and new_num is not None:
        difference = abs(new_num - old_num)
        # For a buyer, more days generally improves cash flow; fewer days makes payment sooner.
        if new_num > old_num:
            opportunity_type = "better_payment_terms"
            severity = "positive"
            title = "Improved buyer payment window"
            recommended = "Confirm the longer payment window is reflected in the final agreement and update cash-flow assumptions."
            business_impact = "Potential cash-flow improvement because payment can be made later."
        else:
            opportunity_type = "worsening_payment_terms"
            severity = "warning"
            title = "Shorter payment window detected"
            recommended = "Review the cash-flow impact and consider negotiating the previous payment terms."
            business_impact = "Payment is due sooner, which may increase short-term cash-flow pressure."
        delta_display = f"{difference:.0f} days {'longer' if new_num > old_num else 'shorter'}"
        percent = None
        explanation = [
            f"Payment terms changed from {previous} to {current}.",
            f"The payment window is now {difference:.0f} days {'longer' if new_num > old_num else 'shorter'}.",
        ]
    elif any(token in lower for token in ("volume", "minimum order", "quantity")) and old_num is not None and new_num is not None:
        opportunity_type = "volume_change"
        severity = "info"
        title = f"Volume commitment changed: {item.title}"
        recommended = "Compare the changed volume with unit pricing and expected demand before treating it as a saving."
        direction = "increased" if new_num > old_num else "decreased"
        business_impact = f"Committed volume has {direction}. This can materially change total spend even when unit pricing moves in the opposite direction."
        explanation = [
            f"{item.title} changed from {previous} to {current}.",
            "GrowthOS treats volume separately from price so apparent unit savings are not mistaken for total-spend savings.",
        ]
    elif item.item_type == "date" or any(token in lower for token in ("renewal", "valid until", "expiry", "review date", "contract end")):
        opportunity_type = "commercial_date_change"
        title = f"Commercial date changed: {item.title}"
        delta_display = None
        percent = None
        recommended = "Review whether this date affects renewal, negotiation, approval or reminder timing."
        old_date, new_date = _parse_business_date(previous), _parse_business_date(current)
        if old_date and new_date:
            days = (new_date - old_date).days
            delta_display = f"{abs(days)} days {'later' if days > 0 else 'earlier'}" if days else "No date movement"
        explanation = [
            f"The {item.title} changed from {previous} to {current}.",
            "GrowthOS treats this as a timeline change rather than calculating a percentage.",
        ]
        business_impact = "A commercial milestone moved. Check reminders, approvals and negotiation timing that depend on this date."
    elif item.item_type == "contract" or any(token in key for token in ("quotation-id", "quote-id", "reference", "contract-id")):
        opportunity_type = "superseded_reference"
        title = f"New commercial reference detected: {item.title}"
        delta_display = None
        percent = None
        recommended = "Confirm whether the new reference is the latest commercial version so future comparisons use the correct record."
        explanation = [
            f"The commercial reference changed from {previous} to {current}.",
            "A reference change can indicate a revised quotation, replacement contract or new commercial version.",
        ]
        business_impact = "The active commercial record may have been superseded. Confirm the latest reference before relying on older documents."

    signature_text = f"{item.company_id}|{item.space_id}|{opportunity_type}|{key}|{previous}|{current}"
    signature = hashlib.sha256(signature_text.encode()).hexdigest()[:40]
    evidence = _source_evidence(database, item, tags, previous_values)

    return Candidate(
        signature=signature,
        opportunity_type=opportunity_type,
        title=title,
        summary=summary,
        confidence=confidence,
        confidence_factors=_confidence_factors(item, tags, confidence),
        severity=severity,
        space_id=item.space_id,
        space_name=space.name if space else None,
        current_value=current,
        previous_value=previous,
        delta_display=delta_display,
        delta_percent=percent,
        explanation=explanation,
        business_impact=business_impact,
        recommended_action=recommended,
        entities=_entities(item, tags),
        evidence=evidence,
    )


def _candidate_for_renewal_fact(database: Session, item: KnowledgeItem, space: KnowledgeSpace | None) -> Candidate | None:
    tags = _tags(item)
    key = (_tag_value(tags, "fact-key") or "").lower()
    lower = f"{item.title} {key}".lower()
    if not any(token in lower for token in ("renewal", "contract end", "contract-end", "expiry", "decision deadline", "renewal-decision")):
        return None
    # Historical date changes are already handled by the changed-fact path.
    if _decoded_values(tags, "previous-value-b64"):
        return None
    value = (item.content or "").strip()
    parsed = _parse_business_date(value)
    if not parsed:
        return None

    confidence_raw = _tag_value(tags, "confidence")
    try:
        confidence = max(65, min(99, int(confidence_raw or 88)))
    except ValueError:
        confidence = 88

    now = datetime.now(timezone.utc)
    days = (parsed.date() - now.date()).days
    if days >= 0:
        title = f"Contract renewal review: {item.title}"
        summary = f"{item.title} is scheduled for {value}, {days} day{'s' if days != 1 else ''} from now."
        impact = "A contract or renewal milestone is approaching. Delayed review could reduce negotiation time or allow an agreement to roll forward without a deliberate decision."
        action = "Review current supplier performance, latest pricing and contract terms before the renewal decision date."
        severity = "warning" if days <= 60 else "info"
        delta_display = f"{days} days remaining"
    else:
        title = f"Renewal status check: {item.title}"
        summary = f"{item.title} was {abs(days)} day{'s' if abs(days) != 1 else ''} ago."
        impact = "The recorded renewal or contract milestone has passed. GrowthOS needs confirmation of the current agreement status so future recommendations use the right contract."
        action = "Confirm whether the agreement renewed, expired, or was replaced, then update the project Knowledge if needed."
        severity = "warning"
        delta_display = f"{abs(days)} days past"

    signature_text = f"{item.company_id}|{item.space_id}|renewal-review|{key or item.title}"
    signature = hashlib.sha256(signature_text.encode()).hexdigest()[:40]
    return Candidate(
        signature=signature,
        opportunity_type="contract_renewal_review",
        title=title,
        summary=summary,
        confidence=confidence,
        confidence_factors=_confidence_factors(item, tags, confidence, has_history=False),
        severity=severity,
        space_id=item.space_id,
        space_name=space.name if space else None,
        current_value=value,
        previous_value=None,
        delta_display=delta_display,
        delta_percent=None,
        explanation=[
            f"GrowthOS identified {item.title} as a contract or renewal milestone.",
            "Renewal timing is useful when deciding whether to renegotiate, compare suppliers or confirm continuity.",
        ],
        business_impact=impact,
        recommended_action=action,
        entities=_entities(item, tags),
        evidence=_source_evidence(database, item, tags),
    )


def _scope_key(space_id: int | None) -> str:
    return "all" if space_id is None else f"space:{space_id}"


def mark_opportunity_review(database: Session, company_id: int, space_id: int | None) -> OpportunityReviewState:
    key = _scope_key(space_id)
    state = database.scalar(select(OpportunityReviewState).where(
        OpportunityReviewState.company_id == company_id,
        OpportunityReviewState.scope_key == key,
    ))
    now = datetime.now(timezone.utc)
    if state is None:
        state = OpportunityReviewState(company_id=company_id, scope_key=key, last_reviewed_at=now)
    else:
        state.last_reviewed_at = now
    database.add(state)
    database.commit()
    database.refresh(state)
    return state


def opportunity_review_state(database: Session, company_id: int, space_id: int | None) -> dict:
    statement = select(KnowledgeItem).where(KnowledgeItem.company_id == company_id)
    if space_id is not None:
        statement = statement.where(KnowledgeItem.space_id == space_id)
    items = list(database.scalars(statement).all())
    latest = max((_as_utc(item.updated_at) for item in items if item.updated_at), default=None)
    state = database.scalar(select(OpportunityReviewState).where(
        OpportunityReviewState.company_id == company_id,
        OpportunityReviewState.scope_key == _scope_key(space_id),
    ))
    reviewed = _as_utc(state.last_reviewed_at) if state else None
    return {
        "needs_review": bool(latest and (reviewed is None or latest > reviewed)),
        "latest_knowledge_at": latest,
        "last_reviewed_at": reviewed,
    }


def _merge_duplicate_candidates(candidates: list[Candidate]) -> list[Candidate]:
    """Collapse repeated findings that describe the same current business event.

    Renewal milestones are grouped by project/type/title. Other findings are only grouped
    when title and current value also match, so genuine sequential price changes remain
    separate opportunities. Evidence is merged and de-duplicated by document/item/value.
    """
    grouped: dict[tuple, list[Candidate]] = {}
    for candidate in candidates:
        title_key = re.sub(r"\s+", " ", candidate.title.strip().lower())
        if candidate.opportunity_type == "contract_renewal_review":
            key = (candidate.space_id, candidate.opportunity_type, title_key)
        else:
            key = (candidate.space_id, candidate.opportunity_type, title_key, candidate.current_value)
        grouped.setdefault(key, []).append(candidate)

    merged: list[Candidate] = []
    for group in grouped.values():
        if len(group) == 1:
            merged.append(group[0])
            continue
        primary = max(group, key=lambda item: (item.confidence, item.current_value or ""))
        evidence: list[dict] = []
        seen: set[tuple] = set()
        for candidate in group:
            for source in candidate.evidence:
                source_key = (source.get("knowledge_item_id"), source.get("document_id"), source.get("role"), source.get("value"))
                if source_key in seen:
                    continue
                seen.add(source_key)
                evidence.append(source)
        confidence = max(candidate.confidence for candidate in group)
        merged.append(Candidate(
            signature=primary.signature,
            opportunity_type=primary.opportunity_type,
            title=primary.title,
            summary=primary.summary,
            confidence=confidence,
            confidence_factors=primary.confidence_factors,
            severity=primary.severity,
            space_id=primary.space_id,
            space_name=primary.space_name,
            current_value=primary.current_value,
            previous_value=primary.previous_value,
            delta_display=primary.delta_display,
            delta_percent=primary.delta_percent,
            explanation=list(dict.fromkeys(reason for candidate in group for reason in candidate.explanation)),
            business_impact=primary.business_impact,
            recommended_action=primary.recommended_action,
            entities=list(dict.fromkeys(entity for candidate in group for entity in candidate.entities))[:8],
            evidence=evidence,
        ))
    return merged


def _build_opportunity_candidates(
    database: Session,
    company_id: int,
    space_id: int | None = None,
) -> tuple[list[Candidate], int]:
    """Build deterministic opportunity candidates without persisting user-facing records."""
    statement = select(KnowledgeItem).where(KnowledgeItem.company_id == company_id)
    if space_id is not None:
        statement = statement.where(KnowledgeItem.space_id == space_id)
    items = list(database.scalars(statement.order_by(KnowledgeItem.updated_at.desc())).all())
    spaces = {
        space.id: space
        for space in database.scalars(
            select(KnowledgeSpace).where(KnowledgeSpace.company_id == company_id)
        ).all()
    }

    candidates: list[Candidate] = []
    for item in items:
        candidate = _candidate_for_changed_fact(database, item, spaces.get(item.space_id))
        if candidate is None:
            candidate = _candidate_for_renewal_fact(database, item, spaces.get(item.space_id))
        if candidate is not None:
            candidates.append(candidate)

    candidates = _merge_duplicate_candidates(candidates)

    # Cross-fact opportunity: unit price down while volume rises in the same project.
    by_space: dict[int, list[Candidate]] = {}
    for candidate in candidates:
        if candidate.space_id is not None:
            by_space.setdefault(candidate.space_id, []).append(candidate)
    for sid, group in by_space.items():
        price_down = next((c for c in group if c.opportunity_type == "supplier_price_reduction"), None)
        volume_up = next(
            (c for c in group if c.opportunity_type == "volume_change" and (c.delta_percent or 0) > 0),
            None,
        )
        if price_down and volume_up:
            signature = hashlib.sha256(
                f"{company_id}|{sid}|volume-price-tradeoff|{price_down.signature}|{volume_up.signature}".encode()
            ).hexdigest()[:40]
            candidates.append(Candidate(
                signature=signature,
                opportunity_type="volume_price_tradeoff",
                title="Lower unit price is paired with a higher volume commitment",
                summary=(
                    "The supplier lowered the unit price while the same project increased "
                    "its committed volume. The unit saving should be checked against total spend."
                ),
                confidence=min(price_down.confidence, volume_up.confidence),
                confidence_factors=[
                    {"label": "Same project", "contribution": 20, "detail": "Both commercial changes belong to the same project."},
                    {"label": "Price history", "contribution": 25, "detail": "Historical evidence shows a lower current unit price."},
                    {"label": "Volume history", "contribution": 25, "detail": "The committed volume increased in the same Knowledge set."},
                    {"label": "Evidence quality", "contribution": max(0, min(price_down.confidence, volume_up.confidence) - 70), "detail": "The underlying facts remain linked to source evidence."},
                ],
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
                    "A lower unit price does not automatically mean lower total spend when committed volume increases.",
                ],
                business_impact=(
                    "The unit-price saving may be valuable, but total annual spend can still rise "
                    "if the higher committed volume outweighs the saving."
                ),
                recommended_action=(
                    "Compare expected total spend, demand, service quality and contract terms "
                    "before accepting the apparent unit-price saving."
                ),
                entities=list(dict.fromkeys(price_down.entities + volume_up.entities))[:8],
                evidence=price_down.evidence + volume_up.evidence,
            ))

    return candidates, len(items)


def preview_opportunities(
    database: Session,
    company_id: int,
    space_id: int | None = None,
) -> dict:
    """Explain whether current Knowledge can support an opportunity without saving one."""
    candidates, knowledge_count = _build_opportunity_candidates(database, company_id, space_id)
    if candidates:
        ordered = sorted(candidates, key=lambda candidate: candidate.confidence, reverse=True)
        return {
            "potential_count": len(ordered),
            "knowledge_count": knowledge_count,
            "highest_confidence": ordered[0].confidence,
            "reasons": [
                f"GrowthOS found {len(ordered)} supported business change{'s' if len(ordered) != 1 else ''} worth reviewing.",
                "The findings are based on captured Knowledge and historical evidence in the selected project.",
            ],
            "candidates": [
                {
                    "title": candidate.title,
                    "confidence": candidate.confidence,
                    "business_impact": candidate.business_impact,
                }
                for candidate in ordered[:5]
            ],
        }

    reasons: list[str] = []
    if knowledge_count == 0:
        reasons.append("There is no captured Knowledge in this project yet.")
    else:
        reasons.extend([
            "No meaningful historical value change or renewal milestone was supported by the current Knowledge.",
            "GrowthOS did not create a finding simply because a document was uploaded or captured.",
        ])
    return {
        "potential_count": 0,
        "knowledge_count": knowledge_count,
        "highest_confidence": None,
        "reasons": reasons,
        "candidates": [],
    }


def detect_opportunities(database: Session, company_id: int, space_id: int | None = None) -> list[OpportunityRecord]:
    candidates, _ = _build_opportunity_candidates(database, company_id, space_id)

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
            # Preserve user status/history while refreshing the deterministic analysis.
            record.space_id = candidate.space_id
            record.opportunity_type = candidate.opportunity_type
            record.title = candidate.title
            record.payload_json = payload
        database.add(record)
        records.append(record)

    # v0.11.7: retire stale unreviewed duplicate renewal cards created by older signatures.
    active_signatures = {candidate.signature for candidate in candidates}
    stale_statement = select(OpportunityRecord).where(
        OpportunityRecord.company_id == company_id,
        OpportunityRecord.status == "detected",
        OpportunityRecord.opportunity_type == "contract_renewal_review",
    )
    if space_id is not None:
        stale_statement = stale_statement.where(OpportunityRecord.space_id == space_id)
    for stale in database.scalars(stale_statement).all():
        if stale.signature not in active_signatures and stale not in records:
            database.delete(stale)
    database.commit()
    for record in records:
        database.refresh(record)
    mark_opportunity_review(database, company_id, space_id)
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
        "confidence_factors": payload.get("confidence_factors", []),
        "severity": payload.get("severity", "info"),
        "current_value": payload.get("current_value"),
        "previous_value": payload.get("previous_value"),
        "delta_display": payload.get("delta_display"),
        "delta_percent": payload.get("delta_percent"),
        "explanation": payload.get("explanation", []),
        "business_impact": payload.get("business_impact", "Review this change in its business context."),
        "recommended_action": payload.get("recommended_action", "Review this change."),
        "entities": payload.get("entities", []),
        "evidence": payload.get("evidence", []),
        "detected_at": record.detected_at,
        "updated_at": record.updated_at,
    }
