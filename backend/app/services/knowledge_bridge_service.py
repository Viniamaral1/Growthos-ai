from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace
from app.services.answer_service import get_ollama_base_url, get_ollama_model


@dataclass(frozen=True)
class KnowledgeFact:
    key: str
    title: str
    value: str
    summary: str
    item_type: str
    confidence: int
    evidence: str
    existing_item_id: int | None = None
    existing_value: str | None = None
    relationship: str = "new"
    calendar_candidate: bool = False
    calendar_reason: str | None = None


def _clean(value: object, maximum: int = 500) -> str:
    return " ".join(str(value or "").split())[:maximum].strip()


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _fact(
    key: str,
    title: str,
    value: str,
    evidence: str,
    *,
    item_type: str = "fact",
    confidence: int = 94,
    calendar_candidate: bool = False,
    calendar_reason: str | None = None,
) -> KnowledgeFact:
    return KnowledgeFact(
        key=_normalise(key)[:120],
        title=_clean(title, 180),
        value=_clean(value, 1200),
        summary=_clean(f"{title}: {value}", 600),
        item_type=item_type,
        confidence=max(0, min(100, confidence)),
        evidence=_clean(evidence, 300),
        calendar_candidate=calendar_candidate,
        calendar_reason=_clean(calendar_reason, 180) if calendar_reason else None,
    )


def _deterministic_facts(text: str) -> list[KnowledgeFact]:
    facts: list[KnowledgeFact] = []
    seen: set[str] = set()

    def add(fact: KnowledgeFact) -> None:
        marker = f"{fact.key}:{_normalise(fact.value)}"
        if fact.key and fact.value and marker not in seen:
            seen.add(marker)
            facts.append(fact)

    label_patterns = {
        "supplier": ("Supplier", "supplier"),
        "vendor": ("Supplier", "supplier"),
        "customer": ("Customer", "customer"),
        "client": ("Customer", "customer"),
        "contract id": ("Contract ID", "contract"),
        "contract": ("Contract", "contract"),
        "agreement": ("Agreement", "contract"),
        "payment terms": ("Payment terms", "commercial"),
        "estimated annual value": ("Estimated annual value", "finance"),
        "annual value": ("Annual value", "finance"),
        "price": ("Price", "finance"),
        "pricing": ("Pricing", "finance"),
        "contract start": ("Contract start", "date"),
        "contract end": ("Contract end", "date"),
        "expiry": ("Expiry", "date"),
        "expiry date": ("Expiry date", "date"),
        "review date": ("Review date", "date"),
        "primary location": ("Primary location", "location"),
        "delivery location": ("Delivery location", "location"),
        "product": ("Product", "product"),
        "service": ("Service", "product"),
    }
    labels = "|".join(sorted((re.escape(key) for key in label_patterns), key=len, reverse=True))
    for match in re.finditer(rf"(?im)^\s*({labels})\s*[:\-]\s*([^\n\r]{{2,220}})", text):
        raw_label = match.group(1).lower().strip()
        title, item_type = label_patterns[raw_label]
        value = match.group(2).strip()
        is_calendar = item_type == "date"
        add(_fact(
            f"{item_type}-{raw_label}", title, value, match.group(0),
            item_type=item_type, confidence=98, calendar_candidate=is_calendar,
            calendar_reason=f"Detected {title.lower()} that may be useful as a reminder or calendar event." if is_calendar else None,
        ))

    # Payment terms are often written in prose.
    for match in re.finditer(r"\b(?:payable|payment(?:s)?(?: are)?(?: due)?|invoice(?:s)?(?: are)? payable)\s+(?:within\s+)?(\d{1,3})\s+days\b", text, re.I):
        add(_fact("commercial-payment-terms", "Payment terms", f"{match.group(1)} days", match.group(0), item_type="commercial", confidence=97))

    # Explicit contract/reference identifiers.
    for match in re.finditer(r"\b(?:contract|agreement|reference|ref(?:erence)?)\s*(?:id|no\.?|number|#|:)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})", text, re.I):
        add(_fact("contract-id", "Contract ID", match.group(1), match.group(0), item_type="contract", confidence=99))

    # Commercial values.
    for match in re.finditer(r"(?<!\w)(?:£|\$|€)\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:per|/)\s*(?:kg|unit|month|year))?", text, re.I):
        add(_fact(f"finance-value-{len(facts)}", "Commercial value", match.group(0), match.group(0), item_type="finance", confidence=96))

    # Important dates.
    date_patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    ]
    for pattern in date_patterns:
        for match in re.finditer(pattern, text, re.I):
            context_start = max(0, match.start() - 90)
            context_end = min(len(text), match.end() + 90)
            context = text[context_start:context_end]
            calendar_terms = ("meeting", "deadline", "renew", "expiry", "review", "due", "payment", "audit", "appointment", "delivery")
            is_calendar = any(term in context.lower() for term in calendar_terms)
            add(_fact(
                f"date-{_normalise(match.group(0))}", "Business date", match.group(0), context,
                item_type="date", confidence=96, calendar_candidate=is_calendar,
                calendar_reason="This date appears near a meeting, deadline, renewal, review, payment, audit or delivery reference." if is_calendar else None,
            ))

    return facts[:18]


def _extract_json(raw: str) -> list[dict]:
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S | re.I)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        value = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def _ai_facts(document: Document) -> list[KnowledgeFact]:
    text = _clean(document.extracted_text, 4200)
    if not text:
        return []
    prompt = f"""Identify up to 8 durable business facts worth remembering from ONE document.
Do not summarise the whole document. Prefer supplier/customer names, prices, payment terms, contract dates,
obligations, deadlines, products, risks and commitments. Return JSON array only.
Each object: key, title, value, item_type, confidence, evidence.
DOCUMENT: {document.original_filename}
TEXT: {text}"""
    try:
        response = httpx.post(
            f"{get_ollama_base_url()}/api/chat",
            json={
                "model": get_ollama_model(),
                "stream": False,
                "messages": [
                    {"role": "system", "content": "Return compact valid JSON only. Never invent facts."},
                    {"role": "user", "content": prompt},
                ],
                "options": {"temperature": 0.0, "num_predict": 420, "num_ctx": 3072},
            },
            timeout=httpx.Timeout(10.0, connect=3.0),
        )
        response.raise_for_status()
        raw = response.json().get("message", {}).get("content", "")
    except (httpx.TimeoutException, httpx.HTTPError, ValueError, TypeError):
        return []

    result: list[KnowledgeFact] = []
    for candidate in _extract_json(raw):
        if not isinstance(candidate, dict):
            continue
        title = _clean(candidate.get("title"), 180)
        value = _clean(candidate.get("value"), 1200)
        if not title or not value:
            continue
        try:
            confidence = int(float(candidate.get("confidence", 80)))
        except (TypeError, ValueError):
            confidence = 80
        key = _clean(candidate.get("key"), 120) or title
        item_type = _clean(candidate.get("item_type"), 40) or "fact"
        evidence = _clean(candidate.get("evidence"), 300)
        calendar_text = f"{title} {value} {evidence}".lower()
        calendar_candidate = item_type == "date" and any(term in calendar_text for term in ("meeting", "deadline", "renew", "expiry", "review", "due", "payment", "audit", "delivery"))
        result.append(_fact(
            key, title, value, evidence, item_type=item_type, confidence=confidence,
            calendar_candidate=calendar_candidate,
            calendar_reason="This looks like a dated business event or deadline." if calendar_candidate else None,
        ))
    return result[:8]


def _with_existing(database: Session, space_id: int, facts: list[KnowledgeFact]) -> list[KnowledgeFact]:
    items = list(database.scalars(select(KnowledgeItem).where(KnowledgeItem.space_id == space_id)).all())
    output: list[KnowledgeFact] = []
    for fact in facts:
        exact: KnowledgeItem | None = None
        related: KnowledgeItem | None = None
        key_tag = f"fact-key:{fact.key}"
        for item in items:
            tags = (item.tags_json or "").lower()
            if key_tag in tags:
                exact = item
                break
            title_norm = _normalise(item.title)
            if title_norm and (title_norm == _normalise(fact.title) or title_norm in fact.key or _normalise(fact.title) in title_norm):
                related = item
        existing = exact or related
        if existing is None:
            output.append(fact)
            continue
        old_value = _clean(existing.content, 1200)
        same = _normalise(old_value) == _normalise(fact.value) or _normalise(fact.value) in _normalise(old_value)
        output.append(KnowledgeFact(
            **{**fact.__dict__,
               "existing_item_id": existing.id,
               "existing_value": old_value,
               "relationship": "same" if same else "changed"}
        ))
    return output


def preview_document_knowledge(database: Session, document_id: int, space_id: int) -> tuple[Document, KnowledgeSpace, list[KnowledgeFact], bool]:
    document = database.get(Document, document_id)
    space = database.get(KnowledgeSpace, space_id)
    if document is None:
        raise ValueError("Document not found")
    if space is None or space.company_id != document.company_id or space.is_archived:
        raise ValueError("Knowledge project not found")
    text = document.extracted_text or ""
    if document.processing_status != "processed" or not text.strip():
        raise ValueError("Process the document before capturing Knowledge")

    deterministic = _deterministic_facts(text)
    ai = _ai_facts(document)
    merged: dict[tuple[str, str], KnowledgeFact] = {}
    for fact in deterministic + ai:
        marker = (fact.key, _normalise(fact.value))
        previous = merged.get(marker)
        if previous is None or fact.confidence > previous.confidence:
            merged[marker] = fact
    facts = _with_existing(database, space_id, list(merged.values())[:20])
    return document, space, facts, bool(ai)


def capture_document_facts(
    database: Session,
    document_id: int,
    space_id: int,
    selected: list[dict],
) -> list[KnowledgeItem]:
    document, space, proposals, _ = preview_document_knowledge(database, document_id, space_id)
    by_key = {fact.key: fact for fact in proposals}
    created_or_updated: list[KnowledgeItem] = []

    for incoming in selected:
        key = _normalise(str(incoming.get("key") or ""))
        proposal = by_key.get(key)
        if proposal is None:
            continue
        title = _clean(incoming.get("title") or proposal.title, 200)
        value = _clean(incoming.get("value") or proposal.value, 5000)
        if not title or not value:
            continue
        source_hash = hashlib.sha256((document.extracted_text or "").encode("utf-8", errors="ignore")).hexdigest()[:16]
        tags = [
            "business-intelligence",
            "knowledge-bridge",
            f"source-document:{document.id}",
            f"source-file:{document.original_filename}",
            f"source-hash:{source_hash}",
            f"fact-key:{proposal.key}",
            f"confidence:{proposal.confidence}",
        ]
        if proposal.calendar_candidate:
            tags.append("calendar-candidate")
        if proposal.existing_item_id and str(incoming.get("action") or "update") == "update":
            item = database.get(KnowledgeItem, proposal.existing_item_id)
            if item is None:
                continue
            old = item.content
            history_note = f"\n\nPrevious value: {old}" if old and _normalise(old) != _normalise(value) else ""
            item.title = title
            item.summary = _clean(f"{title}: {value}", 5000)
            item.content = value + history_note
            try:
                previous_tags = json.loads(item.tags_json or "[]")
            except (TypeError, json.JSONDecodeError):
                previous_tags = []
            merged_tags = [tag for tag in previous_tags if isinstance(tag, str)] + tags + ["updated-from-document"]
            item.tags_json = json.dumps(list(dict.fromkeys(merged_tags)))
            database.add(item)
            created_or_updated.append(item)
        else:
            item = KnowledgeItem(
                company_id=document.company_id,
                space_id=space.id,
                item_type=proposal.item_type or "fact",
                title=title,
                summary=_clean(f"{title}: {value}", 5000),
                content=value,
                tags_json=json.dumps(tags),
                source_conversation_id=None,
                source_message_id=None,
            )
            database.add(item)
            created_or_updated.append(item)

    database.commit()
    for item in created_or_updated:
        database.refresh(item)
    return created_or_updated
