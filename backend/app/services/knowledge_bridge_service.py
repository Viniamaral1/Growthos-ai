from __future__ import annotations

import base64
import hashlib
import json
import re
from datetime import datetime
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
    rationale: tuple[str, ...] = ()
    source_quality: str = "direct_document"
    change_summary: str | None = None
    numeric_delta: float | None = None
    numeric_delta_percent: float | None = None
    comparison_kind: str | None = None
    delta_display: str | None = None
    comparison_reason: str | None = None


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
    rationale: tuple[str, ...] = (),
    source_quality: str = "direct_document",
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
        rationale=tuple(_clean(reason, 220) for reason in rationale if _clean(reason, 220)),
        source_quality=source_quality,
    )




def _current_value(value: str) -> str:
    """Return the current value without legacy inline history notes."""
    return re.split(r"\n\nPrevious value:", value or "", maxsplit=1, flags=re.I)[0].strip()


def _encode_tag(prefix: str, value: str | None) -> str | None:
    if not value:
        return None
    encoded = base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{prefix}:{encoded}"


def _number_from_value(value: str) -> float | None:
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", value or "")
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _date_from_value(value: str) -> datetime | None:
    cleaned = _clean(value, 120)
    formats = (
        "%d %B %Y", "%d %b %Y", "%B %d %Y", "%B %d, %Y",
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def _comparison_kind(fact: KnowledgeFact, old_value: str, new_value: str) -> str:
    if fact.item_type == "date" or _date_from_value(old_value) or _date_from_value(new_value):
        return "date"
    if fact.item_type == "contract" or any(token in fact.key for token in ("reference", "contract-id", "quotation-id", "quote-id")):
        return "identifier"
    lower = f"{fact.title} {fact.key} {old_value} {new_value}".lower()
    if any(symbol in lower for symbol in ("£", "$", "€")) or fact.item_type == "finance":
        return "money"
    if any(token in lower for token in ("kg", "litre", "liter", "units", "volume", "quantity", "minimum order")):
        return "quantity"
    if any(token in lower for token in ("days", "weeks", "months", "payment terms", "duration", "frequency")):
        return "duration"
    return "text"


def _change_metrics(fact: KnowledgeFact, old_value: str, new_value: str) -> tuple[str | None, float | None, float | None, str, str | None]:
    kind = _comparison_kind(fact, old_value, new_value)
    if _normalise(old_value) == _normalise(new_value):
        return (f"No change detected. The value remains {new_value}.", None, None, kind, "No change")

    if kind == "date":
        old_date, new_date = _date_from_value(old_value), _date_from_value(new_value)
        if old_date and new_date:
            days = (new_date - old_date).days
            direction = "later" if days > 0 else "earlier"
            return (f"Date changed from {old_value} to {new_value}.", None, None, kind, f"{abs(days)} days {direction}")
        return (f"Date changed from {old_value} to {new_value}.", None, None, kind, "Date changed")

    if kind == "identifier":
        return (f"Reference changed from {old_value} to {new_value}.", None, None, kind, "Reference changed")

    old_number, new_number = _number_from_value(old_value), _number_from_value(new_value)
    if kind in {"money", "quantity", "duration"} and old_number is not None and new_number is not None:
        delta = new_number - old_number
        percent = (delta / old_number * 100.0) if old_number else None
        direction = "increased" if delta > 0 else "decreased"
        unit_match = re.search(r"(?:£|\$|€|kg|litres?|liters?|days?|weeks?|months?|/\s*kg|per\s+kg)", new_value, re.I)
        unit = unit_match.group(0) if unit_match else ""
        pretty_delta = f"{delta:+,.2f}".rstrip("0").rstrip(".")
        if unit and unit in "£$€":
            pretty_delta = f"{unit}{abs(delta):,.2f}".rstrip("0").rstrip(".") if delta >= 0 else f"-{unit}{abs(delta):,.2f}".rstrip("0").rstrip(".")
        elif unit:
            pretty_delta = f"{pretty_delta} {unit}"
        return (f"Value {direction} from {old_value} to {new_value}.", delta, percent, kind, pretty_delta)

    return (f"Changed from {old_value} to {new_value}.", None, None, kind, "Changed")

def _context_label(text: str, start: int) -> str:
    line_start = max(text.rfind("\n", 0, start), text.rfind("\r", 0, start)) + 1
    prefix = _clean(text[line_start:start], 90)
    prefix = re.sub(r"[^A-Za-z0-9 &/_-]+", " ", prefix).strip(" -:")
    return prefix[-70:].strip()

def _deterministic_facts(text: str) -> list[KnowledgeFact]:
    facts: list[KnowledgeFact] = []
    seen: set[str] = set()

    def add(fact: KnowledgeFact) -> None:
        marker = f"{fact.key}:{_normalise(fact.value)}"
        if fact.key and fact.value and marker not in seen:
            seen.add(marker)
            facts.append(fact)

    label_patterns = {
        "company": ("Company", "organisation"),
        "organisation": ("Organisation", "organisation"),
        "supplier": ("Supplier", "supplier"),
        "vendor": ("Supplier", "supplier"),
        "supplier contact": ("Supplier contact", "contact"),
        "primary contact": ("Primary contact", "contact"),
        "customer": ("Customer", "customer"),
        "client": ("Customer", "customer"),
        "contract id": ("Contract ID", "contract"),
        "quotation id": ("Quotation ID", "contract"),
        "quote id": ("Quotation ID", "contract"),
        "payment terms": ("Payment terms", "commercial"),
        "estimated annual value": ("Estimated annual value", "finance"),
        "estimated annual contract value": ("Estimated annual contract value", "finance"),
        "annual contract value": ("Annual contract value", "finance"),
        "annual value": ("Annual value", "finance"),
        "estimated annual volume": ("Estimated annual volume", "commercial"),
        "annual volume": ("Annual volume", "commercial"),
        "minimum order": ("Minimum order", "commercial"),
        "delivery frequency": ("Delivery frequency", "commercial"),
        "price review frequency": ("Price review frequency", "commercial"),
        "contract duration": ("Contract duration", "contract"),
        "price": ("Price", "finance"),
        "pricing": ("Pricing", "finance"),
        "contract start": ("Contract start", "date"),
        "contract end": ("Contract end", "date"),
        "contract expiry": ("Contract expiry", "date"),
        "expiry": ("Expiry", "date"),
        "expiry date": ("Expiry date", "date"),
        "review date": ("Review date", "date"),
        "commercial review date": ("Commercial review date", "date"),
        "quote date": ("Quote date", "date"),
        "valid until": ("Valid until", "date"),
        "audit date": ("Audit date", "date"),
        "primary location": ("Primary location", "location"),
        "delivery location": ("Delivery location", "location"),
        "location": ("Location", "location"),
        "product": ("Product", "product"),
        "service": ("Service", "product"),
        "target": ("Target", "strategy"),
    }
    labels = "|".join(sorted((re.escape(key) for key in label_patterns), key=len, reverse=True))
    for match in re.finditer(rf"(?im)^\s*({labels})\s*[:\-]\s*([^\n\r]{{2,260}})", text):
        raw_label = match.group(1).lower().strip()
        title, item_type = label_patterns[raw_label]
        value = match.group(2).strip()
        is_calendar = item_type == "date"
        add(_fact(
            f"{item_type}-{raw_label}", title, value, match.group(0),
            item_type=item_type, confidence=98, calendar_candidate=is_calendar,
            calendar_reason=f"Detected {title.lower()} that may be useful as a reminder or calendar event." if is_calendar else None,
            rationale=(
                f"The document labels this value as {title.lower()}.",
                "It is a durable business fact that can be checked against future evidence.",
            ),
        ))

    # Payment terms written in prose. Normalise variants such as
    # "Payment is due 30 calendar days", "payment due 14 days" and "Net 30".
    payment_patterns = (
        r"\b(?:payment(?:s)?(?:\s+is|\s+are)?\s+due|payment\s+terms?|payable|invoice(?:s)?(?:\s+are)?\s+payable)\s*(?:within|in|:|-)?\s*(\d{1,3})\s*(?:calendar\s+|business\s+)?days\b",
        r"\bnet\s*(\d{1,3})\b",
    )
    for pattern in payment_patterns:
        for match in re.finditer(pattern, text, re.I):
            add(_fact(
                "commercial-payment-terms", "Payment terms", f"{match.group(1)} days", match.group(0),
                item_type="commercial", confidence=98,
                rationale=(
                    "The source states a payment window.",
                    "Payment timing affects cash flow and can be checked against contracts, invoices and quotations.",
                ),
            ))

    # Explicit contract/reference identifiers, including "Agreement ref XYZ".
    for match in re.finditer(r"\b(?:contract|agreement|quotation|quote|reference)\s*(?:id|no\.?|number|ref(?:erence)?|#|:)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})", text, re.I):
        if any(fact.item_type == "contract" and _normalise(fact.value) == _normalise(match.group(1)) for fact in facts):
            continue
        reference_value = match.group(1).rstrip(".,;:")
        add(_fact(
            "contract-reference", "Contract / quotation reference", reference_value, match.group(0),
            item_type="contract", confidence=99,
            rationale=("A stable reference helps link future documents to the same commercial record.",),
        ))

    # Unit prices written in prose. Accept ISO currency codes as well as symbols.
    unit_price_patterns = (
        r"(?P<subject>[A-Za-z][A-Za-z0-9 &/'().,-]{2,90}?)\s+is\s+(?:supplied|priced|charged|offered)\s+at\s+(?P<currency>GBP|USD|EUR|£|\$|€)\s*(?P<amount>\d[\d,]*(?:\.\d{1,4})?)\s*(?:per|/)\s*(?P<unit>cartons?|boxes?|packs?|cases?|kg|kilograms?|units?|items?|litres?|liters?|months?|years?)\b",
        r"(?P<subject>[A-Za-z][A-Za-z0-9 &/'().,-]{2,90}?)\s*[-–—]\s*\d[\d,]*\s+(?:cartons?|boxes?|packs?|cases?|kg|kilograms?|units?|items?|litres?|liters?)\s+at\s+(?P<currency>GBP|USD|EUR|£|\$|€)\s*(?P<amount>\d[\d,]*(?:\.\d{1,4})?)\s*(?:per|/)\s*(?P<unit>cartons?|boxes?|packs?|cases?|kg|kilograms?|units?|items?|litres?|liters?|months?|years?)\b",
    )
    currency_names = {"£": "GBP", "$": "USD", "€": "EUR"}
    for pattern in unit_price_patterns:
        for match in re.finditer(pattern, text, re.I):
            subject = _clean(match.group("subject"), 180)
            # PDF extraction can flatten table rows into one line. Prefer the text after
            # the last known business-field marker so document metadata does not become
            # part of the product identity.
            marker_match = list(re.finditer(r"(?i)(?:invoice\s+line|commercial\s+terms|product|service)\s*[:\-]?\s*", subject))
            if marker_match:
                subject = subject[marker_match[-1].end():]
            subject = re.sub(r"(?i)^(?:invoice\s+line|commercial\s+terms|price|pricing)\s*[:\-]?\s*", "", subject).strip(" -:")
            # If flattened metadata still precedes the product, keep the final noun phrase
            # after common reference/date fields.
            subject = re.sub(r"(?i)^.*?(?:agreement\s+ref\s+[A-Z0-9._/-]+|effective\s+date\s+\d{1,2}\s+\w+\s+\d{4}|invoice\s+date\s+\d{1,2}\s+\w+\s+\d{4})\s+", "", subject).strip()
            subject = _clean(subject, 90)
            unit = match.group("unit").lower()
            unit = {
                "cartons": "carton", "boxes": "box", "packs": "pack", "cases": "case",
                "kilograms": "kg", "units": "unit", "items": "item",
                "litres": "litre", "liters": "litre", "months": "month", "years": "year",
            }.get(unit, unit)
            currency = currency_names.get(match.group("currency"), match.group("currency").upper())
            amount = match.group("amount").replace(",", "")
            value = f"{currency} {amount} per {unit}"
            add(_fact(
                f"finance-unit-price-{_normalise(subject)}-{_normalise(unit)}",
                f"{subject} price",
                value,
                _clean(text[max(0, match.start()-70):min(len(text), match.end()+70)], 300),
                item_type="finance",
                confidence=99,
                rationale=(
                    f"The source states a unit price for {subject}.",
                    "The currency, numeric value and unit were normalised so equivalent prices can be compared across documents.",
                ),
            ))

    # Durable quantity/volume commitments written in prose.
    quantity_patterns = (
        r"\b(?:expected\s+annual\s+volume|annual\s+(?:volume|quantity)|approved\s+annual\s+quantity|committed\s+annual\s+(?:volume|quantity))\s*(?:is|of|:|-)?\s*(\d[\d,]*)\s*(cartons?|boxes?|packs?|cases?|kg|kilograms?|units?|items?|litres?|liters?)\b",
        r"\b(?:plan|forecast|budget)\s+(?:assumes|uses|expects)\s*(\d[\d,]*)\s*(cartons?|boxes?|packs?|cases?|kg|kilograms?|units?|items?|litres?|liters?)\b",
    )
    for pattern in quantity_patterns:
        for match in re.finditer(pattern, text, re.I):
            unit = match.group(2).lower()
            unit = {
                "cartons": "carton", "boxes": "box", "packs": "pack", "cases": "case",
                "kilograms": "kg", "units": "unit", "items": "item",
                "litres": "litre", "liters": "litre",
            }.get(unit, unit)
            number = int(match.group(1).replace(",", ""))
            suffix = "" if unit == "kg" else "s"
            add(_fact(
                f"commercial-annual-quantity-{_normalise(unit)}",
                "Annual quantity",
                f"{number:,} {unit}{suffix}",
                _clean(text[max(0, match.start()-80):min(len(text), match.end()+80)], 300),
                item_type="commercial",
                confidence=98,
                rationale=(
                    "The source states an annual quantity or planning volume.",
                    "The quantity and unit were normalised for scope and commitment comparison.",
                ),
            ))

    # Document/source status is useful context for contradiction reasoning.
    for match in re.finditer(r"\b(?:document\s+status|status)\s*[:\-]?\s*(SIGNED\s*-?\s*CURRENT|SUPERSEDED|DRAFT|CURRENT|FINAL|APPROVED|INTERNAL\s+DISCUSSION\s*-?\s*NOT\s+AGREED)\b", text, re.I):
        status_value = _clean(match.group(1), 80)
        add(_fact(
            "document-status", "Document status", status_value, match.group(0),
            item_type="status", confidence=99,
            rationale=("Document status helps GrowthOS distinguish current authority from historical, draft or proposed evidence.",),
        ))

    # Commercial values. Keep a context-derived key so unit price is not confused with annual value.
    for match in re.finditer(r"(?<!\w)(?:GBP|USD|EUR|£|\$|€)\s?\d[\d,]*(?:\.\d{1,4})?(?:\s*(?:per|/)\s*(?:carton|box|pack|case|kg|unit|item|month|year|litre|liter|l))?", text, re.I):
        if any(fact.item_type == "finance" and _normalise(fact.value) == _normalise(match.group(0)) for fact in facts):
            continue
        context_label = _context_label(text, match.start())
        context_norm = _normalise(context_label)
        if any(term in context_norm for term in ("annual", "contract-value", "estimated-value", "commercial-value")):
            title = "Annual / commercial value"
            key = "finance-annual-commercial-value"
        elif any(term in context_norm for term in ("chicken", "turkey", "beef", "pork", "diesel", "price", "unit")) or " per " in match.group(0).lower() or "/" in match.group(0):
            product_label = context_label[-55:] if context_label else "Unit price"
            title = f"{product_label} price" if product_label and "price" not in product_label.lower() else (product_label or "Unit price")
            key = f"finance-unit-price-{context_norm or _normalise(match.group(0))}"
        else:
            title = context_label or "Commercial value"
            key = f"finance-value-{context_norm or _normalise(match.group(0))}"
        add(_fact(
            key, title, match.group(0), _clean(text[max(0, match.start()-90):min(len(text), match.end()+90)], 300),
            item_type="finance", confidence=96,
            rationale=("A monetary value was found in the source evidence.", "Financial values are useful for change and opportunity detection."),
        ))

    # Important dates. Use nearby business language to make stable keys and useful titles.
    date_patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    ]
    date_labels = [
        ("commercial review", "Commercial review date"), ("review", "Review date"),
        ("valid until", "Valid until"), ("quote date", "Quote date"),
        ("contract start", "Contract start"), ("contract end", "Contract end"),
        ("expiry", "Expiry date"), ("renew", "Renewal date"),
        ("payment", "Payment date"), ("due", "Due date"),
        ("meeting", "Meeting date"), ("audit", "Audit date"), ("delivery", "Delivery date"),
    ]
    for pattern in date_patterns:
        for match in re.finditer(pattern, text, re.I):
            if any(fact.item_type == "date" and _normalise(fact.value) == _normalise(match.group(0)) for fact in facts):
                continue
            context_start = max(0, match.start() - 100)
            context_end = min(len(text), match.end() + 100)
            context = text[context_start:context_end]
            lower_context = context.lower()
            found = next(((needle, title) for needle, title in date_labels if needle in lower_context), None)
            if found:
                needle, title = found
                key = f"date-{_normalise(title)}"
                is_calendar = True
            else:
                title = "Business date"
                key = f"date-{_normalise(match.group(0))}"
                is_calendar = False
            add(_fact(
                key, title, match.group(0), context,
                item_type="date", confidence=96, calendar_candidate=is_calendar,
                calendar_reason=f"This date appears near a {found[0]} reference." if found else None,
                rationale=(
                    f"The date appears in business context{f' related to {found[0]}' if found else ''}.",
                    "Dates can support timelines, reminders and evidence freshness checks.",
                ),
            ))

    # Simple action/risk cues. These are intentionally conservative.
    for match in re.finditer(r"(?im)^\s*(?:action|recommended action|recommendation)\s*[:\-]\s*([^\n\r]{8,240})", text):
        add(_fact(f"task-{_normalise(match.group(1))[:60]}", "Recommended action", match.group(1), match.group(0), item_type="task", confidence=91,
                  rationale=("The source explicitly labels this as an action or recommendation.",)))
    for match in re.finditer(r"(?im)^\s*(?:risk|issue|concern)\s*[:\-]\s*([^\n\r]{8,240})", text):
        add(_fact(f"risk-{_normalise(match.group(1))[:60]}", "Risk / issue", match.group(1), match.group(0), item_type="risk", confidence=91,
                  rationale=("The source explicitly identifies this as a risk or issue.",)))

    return facts[:28]

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
            rationale=(
                "Local AI identified this as a durable business fact rather than temporary document wording.",
                "The proposed value is grounded in the quoted source evidence.",
            ),
        ))
    return result[:8]


def _with_existing(database: Session, space_id: int, facts: list[KnowledgeFact]) -> list[KnowledgeFact]:
    items = list(database.scalars(select(KnowledgeItem).where(KnowledgeItem.space_id == space_id)).all())
    output: list[KnowledgeFact] = []
    generic_titles = {"business-date", "commercial-value", "annual-commercial-value", "price", "pricing"}

    for fact in facts:
        exact: KnowledgeItem | None = None
        related: KnowledgeItem | None = None
        key_tag = f"fact-key:{fact.key}"
        for item in items:
            tags = item.tags_json or ""
            if key_tag in tags:
                exact = item
                break

        if exact is None and _normalise(fact.title) not in generic_titles:
            for item in items:
                if (item.item_type or "fact") != fact.item_type:
                    continue
                if _normalise(item.title) == _normalise(fact.title):
                    related = item
                    break

        existing = exact or related
        if existing is None:
            output.append(fact)
            continue

        old_value = _current_value(_clean(existing.content, 1200))
        same = _normalise(old_value) == _normalise(fact.value)
        if same:
            output.append(KnowledgeFact(**{**fact.__dict__, "existing_item_id": existing.id, "existing_value": old_value, "relationship": "same"}))
            continue

        change_summary, delta, delta_percent, comparison_kind, delta_display = _change_metrics(fact, old_value, fact.value)
        output.append(KnowledgeFact(**{
            **fact.__dict__,
            "existing_item_id": existing.id,
            "existing_value": old_value,
            "relationship": "changed",
            "change_summary": change_summary,
            "numeric_delta": delta,
            "numeric_delta_percent": delta_percent,
            "comparison_kind": comparison_kind,
            "delta_display": delta_display,
            "comparison_reason": (
                f"Matched because both records contain the same {fact.title.strip().rstrip('.') or fact.item_type.replace('_', ' ')} "
                f"inside this Knowledge project."
            ),
        }))
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
            f"source-quality:{proposal.source_quality}",
        ]
        evidence_tag = _encode_tag("evidence-b64", proposal.evidence)
        if evidence_tag:
            tags.append(evidence_tag)
        for reason in proposal.rationale:
            reason_tag = _encode_tag("reason-b64", reason)
            if reason_tag:
                tags.append(reason_tag)
        if proposal.calendar_candidate:
            tags.append("calendar-candidate")
            calendar_tag = _encode_tag("calendar-reason-b64", proposal.calendar_reason)
            if calendar_tag:
                tags.append(calendar_tag)
        if proposal.existing_item_id and str(incoming.get("action") or "update") == "update":
            item = database.get(KnowledgeItem, proposal.existing_item_id)
            if item is None:
                continue
            old = _current_value(item.content)
            item.title = title
            item.summary = _clean(f"{title}: {value}", 5000)
            item.content = value
            try:
                previous_tags = json.loads(item.tags_json or "[]")
            except (TypeError, json.JSONDecodeError):
                previous_tags = []
            merged_tags = [tag for tag in previous_tags if isinstance(tag, str)] + tags + ["updated-from-document", "relationship:changed"]
            history_tag = _encode_tag("previous-value-b64", old) if old and _normalise(old) != _normalise(value) else None
            if history_tag:
                merged_tags.append(history_tag)
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
