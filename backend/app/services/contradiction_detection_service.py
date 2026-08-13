from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
from dataclasses import dataclass
from itertools import combinations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contradiction import ContradictionRecord
from app.models.document import Document
from app.models.knowledge_item import KnowledgeItem
from app.models.knowledge_space import KnowledgeSpace


def _tags(item: KnowledgeItem) -> list[str]:
    try:
        return [x for x in json.loads(item.tags_json or "[]") if isinstance(x, str)]
    except Exception:
        return []


def _dec(tag: str, prefix: str) -> str | None:
    if not tag.startswith(prefix + ":"):
        return None
    raw = tag.split(":", 1)[1]
    try:
        return base64.urlsafe_b64decode((raw + "=" * (-len(raw) % 4)).encode()).decode()
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None


def _previous_values(tags: list[str]) -> list[str]:
    out: list[str] = []
    for tag in tags:
        value = _dec(tag, "previous-value-b64")
        if value and value not in out:
            out.append(value)
    return out


def _source_ids(tags: list[str]) -> list[int]:
    out: list[int] = []
    for tag in tags:
        if tag.startswith("source-document:"):
            try:
                value = int(tag.split(":", 1)[1])
            except ValueError:
                continue
            if value not in out:
                out.append(value)
    return out


def _tag(tags: list[str], prefix: str) -> str | None:
    marker = prefix + ":"
    return next((tag[len(marker):] for tag in reversed(tags) if tag.startswith(marker)), None)


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")


def _classify(name: str | None) -> str:
    n = (name or "").lower()
    if "amendment" in n or "addendum" in n:
        return "amendment"
    if "invoice" in n:
        return "invoice"
    if ("signed" in n and "scope" in n) or "contract" in n or "agreement" in n:
        return "contract"
    if "project plan" in n or "scope plan" in n or ("plan" in n and "signed" not in n):
        return "plan"
    if "meeting" in n or "minutes" in n:
        return "meeting"
    if "quote" in n or "quotation" in n:
        return "quotation"
    if "policy" in n:
        return "policy"
    if "email" in n:
        return "email"
    return "document"


def _num(value: str) -> float | None:
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", value or "")
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _kind(item: KnowledgeItem) -> str:
    text = f"{item.title} {item.item_type}".lower()
    if any(x in text for x in ["price", "cost", "rate", "commercial value", "contract value"]):
        return "price"
    if "payment" in text and ("term" in text or "day" in text):
        return "payment_terms"
    if any(x in text for x in ["date", "expiry", "expiration", "deadline", "renewal"]):
        return "date"
    if any(x in text for x in ["volume", "quantity", "minimum order"]):
        return "quantity"
    if any(x in text for x in ["supplier", "vendor", "provider"]):
        return "supplier"
    if any(x in text for x in ["reference", "quotation id", "contract id"]):
        return "reference"
    return "generic"


def _material(kind: str, a: str, b: str) -> bool:
    if _normalise(a) == _normalise(b):
        return False
    if kind in {"price", "quantity", "payment_terms"}:
        first, second = _num(a), _num(b)
        return first is not None and second is not None and abs(first - second) > 1e-9
    return True


def _eligible(classes: list[str], kind: str) -> bool:
    cs = set(classes)
    if len(cs) < 2:
        return False
    if cs == {"quotation"}:
        return False

    if kind == "price":
        return (
            "contract" in cs and ("invoice" in cs or "quotation" in cs or "amendment" in cs)
        ) or ("invoice" in cs and "quotation" in cs)

    if kind == "payment_terms":
        return "contract" in cs and bool(cs.intersection({"invoice", "meeting", "quotation", "amendment"}))

    if kind == "date":
        return "contract" in cs and bool(cs.intersection({"amendment", "meeting", "plan"}))

    if kind == "quantity":
        return "contract" in cs and bool(cs.intersection({"quotation", "plan", "amendment"}))

    if kind in {"supplier", "reference"}:
        return "contract" in cs and bool(cs.intersection({"meeting", "quotation", "invoice", "amendment"}))

    return False


def _is_superseded(document: Document | None) -> bool:
    if document is None:
        return False
    text = f"{document.original_filename or ''}\n{document.extracted_text or ''}".lower()
    return any(
        phrase in text
        for phrase in (
            "status superseded",
            "document status superseded",
            "this quotation was superseded",
            "superseded by",
            "obsolete version",
        )
    )


def _is_proposal(document: Document | None) -> bool:
    if document is None:
        return False
    text = (document.extracted_text or "").lower()
    proposal_cues = (
        "would like to request",
        "request 60",
        "request ",
        "proposed",
        "proposal",
        "not accepted",
        "not agreed",
        "subject to negotiation",
        "for discussion",
    )
    final_cues = ("signed - current", "signed current", "approved amendment", "agreed and signed")
    return any(cue in text for cue in proposal_cues) and not any(cue in text for cue in final_cues)


def _authority(document: Document | None) -> int:
    if document is None:
        return 0
    cls = _classify(document.original_filename)
    text = (document.extracted_text or "").lower()
    if _is_superseded(document):
        return 5
    if cls == "amendment" and ("signed" in text or "approved" in text):
        return 100
    if cls == "contract" and ("signed" in text or "current" in text):
        return 95
    return {
        "contract": 90,
        "invoice": 85,
        "quotation": 70,
        "plan": 60,
        "meeting": 50,
        "policy": 80,
        "email": 45,
        "document": 40,
    }.get(cls, 40)


def _canonical_key(item: KnowledgeItem, tags: list[str]) -> str:
    tagged = _tag(tags, "fact-key")
    base = _normalise(tagged or item.title)

    # Older captures can have context-heavy keys. Reduce well-known concepts
    # to stable business keys so separate documents can still be paired.
    kind = _kind(item)
    if kind == "payment_terms":
        return "payment-terms"
    if kind == "quantity" and "annual" in f"{base} {_normalise(item.title)}":
        unit = "kg" if "kg" in (item.content or "").lower() else re.sub(r"[^a-z]", "", (item.content or "").split()[-1].lower())
        return f"annual-quantity-{unit or 'unit'}"
    if kind == "price":
        title = _normalise(item.title)
        for suffix in ("-price", "price-"):
            title = title.replace(suffix, "-")
        # Remove generic field words while keeping the product/service identity.
        title = re.sub(r"^(?:commercial|finance|invoice-line|unit)-", "", title)
        title = re.sub(r"-(?:commercial-value|annual-value)$", "", title)
        return f"price-{title.strip('-') or base}"
    if kind == "reference":
        return "commercial-reference"
    return base or _normalise(item.title)


@dataclass(frozen=True)
class EvidenceFact:
    item: KnowledgeItem
    fact_key: str
    kind: str
    value: str
    document: Document | None
    source_quality: str
    historical: bool = False


def _evidence_facts(db: Session, item: KnowledgeItem) -> list[EvidenceFact]:
    tags = _tags(item)
    ids = _source_ids(tags)
    key = _canonical_key(item, tags)
    kind = _kind(item)
    quality = _tag(tags, "source-quality") or "direct_document"
    values = _previous_values(tags) + [(item.content or "").strip()]
    if not values[-1]:
        return []

    # Knowledge history stores prior values and source-document tags in order.
    # Pair older values with older source IDs and the current value with the latest.
    docs = [db.get(Document, doc_id) for doc_id in ids]
    out: list[EvidenceFact] = []
    if len(values) > 1 and docs:
        previous_values = values[:-1]
        previous_docs = docs[: len(previous_values)]
        for index, value in enumerate(previous_values):
            document = previous_docs[index] if index < len(previous_docs) else (docs[0] if docs else None)
            out.append(EvidenceFact(item, key, kind, value, document, quality, historical=True))

    current_doc = docs[-1] if docs else None
    out.append(EvidenceFact(item, key, kind, values[-1], current_doc, quality, historical=False))
    return out


def _severity(kind: str, a_doc: Document | None, b_doc: Document | None) -> str:
    classes = {_classify(a_doc.original_filename if a_doc else None), _classify(b_doc.original_filename if b_doc else None)}
    if kind in {"price", "payment_terms"} and "contract" in classes and "invoice" in classes:
        return "high"
    if kind in {"date", "quantity"}:
        return "medium"
    return "medium"


def _confidence(kind: str, a_doc: Document | None, b_doc: Document | None) -> int:
    base = 84
    if a_doc and b_doc:
        base += 4
    if _authority(a_doc) >= 85 or _authority(b_doc) >= 85:
        base += 5
    if kind in {"price", "payment_terms", "quantity"}:
        base += 3
    return min(98, base)


def _reason(kind: str, title: str, classes: list[str], a_doc: Document | None, b_doc: Document | None) -> str:
    pair = " vs ".join(classes)
    authority_a, authority_b = _authority(a_doc), _authority(b_doc)
    authority_note = ""
    if authority_a != authority_b:
        stronger = a_doc if authority_a > authority_b else b_doc
        if stronger:
            authority_note = f" {stronger.original_filename} currently has the stronger source-authority signal."
    return (
        f"Two active business sources describe the same {title} with incompatible values ({pair})."
        f"{authority_note}"
    )


def _impact(kind: str) -> str:
    return {
        "price": "A pricing mismatch may lead to overpayment, margin erosion or an incorrect purchasing decision.",
        "payment_terms": "Conflicting payment terms can create cash-flow problems, invoice disputes or incorrect supplier expectations.",
        "date": "Conflicting dates can cause missed renewals, deadlines or obligations.",
        "quantity": "Conflicting quantities can affect inventory, storage, spend and fulfilment planning.",
        "supplier": "Different supplier records may cause an approval or contracting error.",
        "reference": "Different references may indicate the wrong commercial version is being used.",
    }.get(kind, "The business record is inconsistent and should be verified.")


def _dedupe_facts(facts: list[EvidenceFact]) -> list[EvidenceFact]:
    seen: set[tuple[str, str, int | None]] = set()
    out: list[EvidenceFact] = []
    for fact in facts:
        marker = (fact.fact_key, _normalise(fact.value), fact.document.id if fact.document else None)
        if marker in seen:
            continue
        seen.add(marker)
        out.append(fact)
    return out


def detect_contradictions(db: Session, company_id: int, space_id: int | None = None) -> list[ContradictionRecord]:
    query = select(KnowledgeItem).where(KnowledgeItem.company_id == company_id)
    if space_id is not None:
        query = query.where(KnowledgeItem.space_id == space_id)

    items = list(db.scalars(query).all())
    facts = _dedupe_facts([fact for item in items for fact in _evidence_facts(db, item)])

    grouped: dict[tuple[int | None, str], list[EvidenceFact]] = {}
    for fact in facts:
        if fact.kind == "generic":
            continue
        grouped.setdefault((fact.item.space_id, fact.fact_key), []).append(fact)

    results: list[ContradictionRecord] = []
    produced_signatures: set[str] = set()

    for (_, _), group in grouped.items():
        for first, second in combinations(group, 2):
            if first.document and second.document and first.document.id == second.document.id:
                continue
            if not _material(first.kind, first.value, second.value):
                continue

            # Historical/superseded evidence should remain history, not an active contradiction.
            if _is_superseded(first.document) or _is_superseded(second.document):
                continue

            # A request/proposal is context, not an agreed fact. This is the key semantic guard
            # for cases such as "we would like to request 60-day payment terms".
            if _is_proposal(first.document) or _is_proposal(second.document):
                continue

            classes = [
                _classify(first.document.original_filename if first.document else None),
                _classify(second.document.original_filename if second.document else None),
            ]
            if not _eligible(classes, first.kind):
                continue

            title = first.item.title if len(first.item.title) >= len(second.item.title) else second.item.title
            space = db.get(KnowledgeSpace, first.item.space_id) if first.item.space_id else None

            # Stable ordering: lower authority first only for display neutrality; the explanation
            # separately identifies the stronger source.
            a, b = first, second
            if (a.document.id if a.document else 0) > (b.document.id if b.document else 0):
                a, b = b, a
                classes = [classes[1], classes[0]]

            signature = hashlib.sha1(
                (
                    f"{company_id}|{a.item.space_id}|{a.fact_key}|{a.document.id if a.document else 0}|"
                    f"{b.document.id if b.document else 0}|{_normalise(a.value)}|{_normalise(b.value)}"
                ).encode()
            ).hexdigest()
            if signature in produced_signatures:
                continue
            produced_signatures.add(signature)

            payload = {
                "summary": f"{title} has incompatible active values across two business sources.",
                "confidence": _confidence(a.kind, a.document, b.document),
                "severity": _severity(a.kind, a.document, b.document),
                "statement_a": a.value,
                "statement_b": b.value,
                "reason": _reason(a.kind, title, classes, a.document, b.document),
                "business_impact": _impact(a.kind),
                "recommended_verification": "Open both sources, verify which one is authoritative, and update Knowledge only after the business position is confirmed.",
                "evidence": [
                    {
                        "knowledge_item_id": a.item.id,
                        "document_id": a.document.id if a.document else None,
                        "document_name": a.document.original_filename if a.document else None,
                        "label": a.item.title,
                        "value": a.value,
                        "role": "statement_a",
                        "source_quality": a.source_quality,
                    },
                    {
                        "knowledge_item_id": b.item.id,
                        "document_id": b.document.id if b.document else None,
                        "document_name": b.document.original_filename if b.document else None,
                        "label": b.item.title,
                        "value": b.value,
                        "role": "statement_b",
                        "source_quality": b.source_quality,
                    },
                ],
                "space_name": space.name if space else None,
            }

            record = db.scalar(
                select(ContradictionRecord).where(
                    ContradictionRecord.company_id == company_id,
                    ContradictionRecord.signature == signature,
                )
            )
            if record is None:
                record = ContradictionRecord(
                    company_id=company_id,
                    space_id=a.item.space_id,
                    signature=signature,
                    status="detected",
                    contradiction_type=a.kind,
                    title=f"Possible {title} contradiction",
                    payload_json=json.dumps(payload),
                )
            else:
                record.payload_json = json.dumps(payload)
                record.space_id = a.item.space_id

            db.add(record)
            results.append(record)

    db.commit()
    for record in results:
        db.refresh(record)
    return results


def serialize_contradiction(db: Session, record: ContradictionRecord) -> dict:
    payload = json.loads(record.payload_json)
    return {
        "id": record.id,
        "company_id": record.company_id,
        "space_id": record.space_id,
        "space_name": payload.get("space_name"),
        "status": record.status,
        "contradiction_type": record.contradiction_type,
        "title": record.title,
        **{
            key: payload[key]
            for key in [
                "summary",
                "confidence",
                "severity",
                "statement_a",
                "statement_b",
                "reason",
                "business_impact",
                "recommended_verification",
                "evidence",
            ]
        },
        "resolution": payload.get("resolution"),
        "detected_at": record.detected_at,
        "updated_at": record.updated_at,
    }
