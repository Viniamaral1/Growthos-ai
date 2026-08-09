from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.business_entity import (
    BusinessEntity,
    BusinessEntityExtraction,
    BusinessEntitySource,
)
from app.models.company import Company
from app.models.document import Document
from app.services.answer_service import get_ollama_base_url, get_ollama_model

_ALLOWED_TYPES = {
    "person", "organisation", "supplier", "customer", "product",
    "contract", "location", "money", "date", "risk", "opportunity",
}


@dataclass(frozen=True)
class EntitySource:
    kind: str
    source_id: int
    title: str
    text: str


def _clip(value: object, maximum: int = 18000) -> str:
    return " ".join(str(value or "").split())[:maximum]


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _document_source(database: Session, company_id: int, document_id: int) -> EntitySource:
    document = database.get(Document, document_id)
    if document is None or document.company_id != company_id:
        raise ValueError("Document not found in this workspace")
    if document.processing_status != "processed":
        raise ValueError("Process the document before mapping entities")
    text = _clip(document.extracted_text)
    if not text.strip():
        raise ValueError("The document has no extracted text to analyse")
    return EntitySource("document", document.id, document.original_filename, text)


def _extract_json(raw: str) -> list[dict[str, object]]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        parsed = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _record(entity_type: str, name: str, evidence: str, confidence: float, description: str = "") -> dict[str, object] | None:
    clean_name = _clip(name, 200).strip(" :-,.;")
    normalized = _normalise(clean_name)
    if entity_type not in _ALLOWED_TYPES or len(normalized) < 2:
        return None
    return {
        "entity_type": entity_type,
        "name": clean_name,
        "normalized_name": normalized,
        "description": _clip(description, 400),
        "confidence": max(0.0, min(1.0, confidence)),
        "evidence": _clip(evidence, 180),
    }


def _deterministic_entities(source: EntitySource) -> list[dict[str, object]]:
    """Extract high-confidence entities without invoking the local LLM.

    This keeps per-asset mapping useful even when Ollama is slow or unavailable.
    The patterns are intentionally conservative and focus on explicit business data.
    """
    text = source.text
    results: list[dict[str, object]] = []

    def add(kind: str, name: str, evidence: str, confidence: float = 0.96, description: str = "") -> None:
        item = _record(kind, name, evidence, confidence, description)
        if item is not None:
            results.append(item)

    # Money and currency values.
    for match in re.finditer(r"(?<!\w)(?:£|\$|€)\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:k|m|million|thousand))?(?:\s*(?:per|/)?\s*(?:kg|unit|month|year))?", text, re.I):
        add("money", match.group(0), match.group(0), 0.99, "Explicit monetary value")

    # Common business date formats.
    date_patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    ]
    for pattern in date_patterns:
        for match in re.finditer(pattern, text, re.I):
            add("date", match.group(0), match.group(0), 0.99, "Explicit date")

    # Contract / agreement identifiers.
    for match in re.finditer(r"\b(?:contract|agreement|reference|ref(?:erence)?|contract\s*id)\s*(?:id|no\.?|number|#|:)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})", text, re.I):
        value = match.group(1)
        add("contract", value, match.group(0), 0.99, "Explicit contract or agreement identifier")

    # Labelled entities. These are much safer than trying to infer names from all title-cased text.
    label_map = {
        "supplier": "supplier",
        "vendor": "supplier",
        "customer": "customer",
        "client": "customer",
        "product": "product",
        "service": "product",
        "location": "location",
        "delivery location": "location",
        "delivery address": "location",
        "company": "organisation",
        "organisation": "organisation",
        "organization": "organisation",
        "contract": "contract",
        "agreement": "contract",
        "risk": "risk",
        "opportunity": "opportunity",
        "contact": "person",
        "representative": "person",
        "signed by": "person",
        "name": "person",
    }
    labels = "|".join(sorted((re.escape(k) for k in label_map), key=len, reverse=True))
    for match in re.finditer(rf"(?im)^\s*({labels})\s*[:\-]\s*([^\n\r]{{2,120}})", text):
        label = match.group(1).lower().strip()
        value = match.group(2).strip()
        # Stop labelled fields from swallowing the next obvious clause in flattened text.
        value = re.split(r"\s{2,}|\s+[A-Z][A-Za-z ]{1,24}:\s*", value, maxsplit=1)[0].strip()
        add(label_map[label], value, match.group(0), 0.97, f"Explicitly labelled {label}")

    # Legal/company suffixes are a useful deterministic organisation signal.
    org_pattern = r"\b([A-Z][A-Za-z0-9&'., -]{1,70}\s(?:Ltd|Limited|LLC|Inc\.?|PLC|Corp\.?|Corporation|GmbH|LLP))\b"
    for match in re.finditer(org_pattern, text):
        add("organisation", match.group(1), match.group(0), 0.96, "Named organisation")

    # Deduplicate deterministic candidates.
    deduped: dict[tuple[str, str], dict[str, object]] = {}
    for item in results:
        key = (str(item["entity_type"]), str(item["normalized_name"]))
        if key not in deduped or float(item["confidence"]) > float(deduped[key]["confidence"]):
            deduped[key] = item
    return list(deduped.values())[:18]


def _set_extraction_state(
    database: Session,
    *,
    company_id: int,
    source_kind: str,
    source_id: int,
    status: str,
    entity_count: int = 0,
    error: str | None = None,
) -> None:
    state = database.scalar(
        select(BusinessEntityExtraction).where(
            BusinessEntityExtraction.company_id == company_id,
            BusinessEntityExtraction.source_kind == source_kind,
            BusinessEntityExtraction.source_id == source_id,
        )
    )
    if state is None:
        state = BusinessEntityExtraction(
            company_id=company_id,
            source_kind=source_kind,
            source_id=source_id,
        )
        database.add(state)
    state.status = status
    state.entity_count = entity_count
    state.model = get_ollama_model()
    state.error = error
    state.processed_at = datetime.now(timezone.utc) if status in {"completed", "partial", "failed"} else None


def pending_document_count(database: Session, company_id: int) -> int:
    processed_ids = list(database.scalars(
        select(Document.id).where(
            Document.company_id == company_id,
            Document.processing_status == "processed",
        )
    ).all())
    if not processed_ids:
        return 0
    mapped_ids = set(database.scalars(
        select(BusinessEntityExtraction.source_id).where(
            BusinessEntityExtraction.company_id == company_id,
            BusinessEntityExtraction.source_kind == "document",
            BusinessEntityExtraction.status.in_(["completed", "partial"]),
            BusinessEntityExtraction.source_id.in_(processed_ids),
        )
    ).all())
    return sum(1 for document_id in processed_ids if document_id not in mapped_ids)


def _representative_chunks(text: str, chunk_size: int = 950) -> list[str]:
    clean = " ".join((text or "").split())
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [clean]
    starts = [0]
    if len(clean) > chunk_size * 2:
        starts.append(max(0, len(clean) // 2 - chunk_size // 2))
    starts.append(max(0, len(clean) - chunk_size))
    chunks: list[str] = []
    for start in starts:
        chunk = clean[start:start + chunk_size]
        if chunk and chunk not in chunks:
            chunks.append(chunk)
    return chunks[:3]


def _call_local_ai(company_name: str, source: EntitySource) -> list[dict[str, object]]:
    # Large assets are sampled in small representative chunks. Each request is bounded,
    # so one slow chunk cannot block the entire document mapping operation.
    chunks = _representative_chunks(source.text)
    if not chunks:
        return []

    collected: list[dict[str, object]] = []
    failures = 0

    for index, chunk in enumerate(chunks, start=1):
        prompt = f"""Extract up to 6 business entities from ONE document chunk for workspace {company_name!r}.
Return JSON array only. Do not guess.
Types: person, organisation, supplier, customer, product, contract, location, risk, opportunity.
Each object: entity_type, name, description, confidence, evidence.
SOURCE TITLE: {source.title}
CHUNK {index}/{len(chunks)}:
{chunk}"""
        try:
            response = httpx.post(
                f"{get_ollama_base_url()}/api/chat",
                json={
                    "model": get_ollama_model(),
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": "Return valid compact JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    "options": {
                        "temperature": 0.0,
                        "num_predict": 260,
                        "num_ctx": 2048,
                    },
                },
                timeout=httpx.Timeout(8.0, connect=3.0),
            )
            response.raise_for_status()
            raw = response.json().get("message", {}).get("content", "")
            collected.extend(_extract_json(raw))
        except (httpx.TimeoutException, httpx.HTTPError, ValueError, TypeError):
            failures += 1
            continue

    if failures == len(chunks):
        raise RuntimeError("Local AI enrichment timed out on all bounded chunks")
    return collected

def _clean_candidates(candidates: list[dict[str, object]]) -> dict[tuple[str, str], dict[str, object]]:
    cleaned: dict[tuple[str, str], dict[str, object]] = {}
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        entity_type = str(candidate.get("entity_type", "")).strip().lower()
        name = _clip(candidate.get("name"), 200)
        normalized = _normalise(name)
        try:
            confidence = max(0.0, min(1.0, float(candidate.get("confidence", 0.5))))
        except (TypeError, ValueError):
            continue
        if entity_type not in _ALLOWED_TYPES or len(normalized) < 2:
            continue
        record = {
            "entity_type": entity_type,
            "name": name,
            "normalized_name": normalized,
            "description": _clip(candidate.get("description"), 400),
            "confidence": confidence,
            "evidence": _clip(candidate.get("evidence"), 180),
        }
        key = (entity_type, normalized)
        if key not in cleaned or confidence > float(cleaned[key]["confidence"]):
            cleaned[key] = record
    return cleaned


def _persist_candidates(
    database: Session,
    company_id: int,
    source: EntitySource,
    cleaned: dict[tuple[str, str], dict[str, object]],
) -> tuple[int, int]:
    legacy_entity_ids = set(database.scalars(
        select(BusinessEntity.id).where(
            BusinessEntity.company_id == company_id,
            BusinessEntity.source_kind == source.kind,
            BusinessEntity.source_id == source.source_id,
        )
    ).all())
    linked_entity_ids = set(database.scalars(
        select(BusinessEntitySource.entity_id).where(
            BusinessEntitySource.company_id == company_id,
            BusinessEntitySource.source_kind == source.kind,
            BusinessEntitySource.source_id == source.source_id,
        )
    ).all())
    previous_entity_ids = legacy_entity_ids | linked_entity_ids

    database.execute(delete(BusinessEntitySource).where(
        BusinessEntitySource.company_id == company_id,
        BusinessEntitySource.source_kind == source.kind,
        BusinessEntitySource.source_id == source.source_id,
    ))

    mapped_entity_ids: set[int] = set()
    created = 0
    linked = 0

    for record in list(cleaned.values())[:20]:
        entity = database.scalar(
            select(BusinessEntity).where(
                BusinessEntity.company_id == company_id,
                BusinessEntity.entity_type == record["entity_type"],
                BusinessEntity.normalized_name == record["normalized_name"],
            )
        )
        if entity is None:
            entity = BusinessEntity(
                company_id=company_id,
                entity_type=str(record["entity_type"]),
                name=str(record["name"]),
                normalized_name=str(record["normalized_name"]),
                description=str(record["description"] or "") or None,
                confidence=float(record["confidence"]),
                source_kind=source.kind,
                source_id=source.source_id,
                evidence=str(record["evidence"] or "") or None,
            )
            database.add(entity)
            database.flush()
            created += 1
        elif float(record["confidence"]) >= entity.confidence:
            entity.name = str(record["name"])
            entity.description = str(record["description"] or "") or entity.description
            entity.confidence = float(record["confidence"])
            entity.source_kind = source.kind
            entity.source_id = source.source_id
            entity.evidence = str(record["evidence"] or "") or entity.evidence

        database.add(BusinessEntitySource(
            company_id=company_id,
            entity_id=entity.id,
            source_kind=source.kind,
            source_id=source.source_id,
            evidence=str(record["evidence"] or "") or None,
            confidence=float(record["confidence"]),
        ))
        mapped_entity_ids.add(entity.id)
        linked += 1

    database.flush()

    for entity_id in previous_entity_ids - mapped_entity_ids:
        remaining_links = database.scalar(
            select(func.count(BusinessEntitySource.id)).where(BusinessEntitySource.entity_id == entity_id)
        ) or 0
        entity = database.get(BusinessEntity, entity_id)
        if entity is not None and remaining_links == 0:
            database.delete(entity)

    return created, linked


def map_source_entities(database: Session, company_id: int, source: EntitySource) -> dict[str, object]:
    company = database.get(Company, company_id)
    if company is None:
        raise ValueError("Workspace not found")

    _set_extraction_state(
        database,
        company_id=company_id,
        source_kind=source.kind,
        source_id=source.source_id,
        status="processing",
    )
    database.commit()

    deterministic = _deterministic_entities(source)
    ai_candidates: list[dict[str, object]] = []
    ai_error: str | None = None

    try:
        ai_candidates = _call_local_ai(company.name, source)
    except RuntimeError as error:
        ai_error = str(error)

    cleaned = _clean_candidates(deterministic + ai_candidates)

    if not cleaned and ai_error:
        # A slow local model should never make the whole asset unusable.
        # Persist a partial zero-entity result so the UI can retry enrichment later
        # without returning a 503 or losing the document's processing state.
        _set_extraction_state(
            database,
            company_id=company_id,
            source_kind=source.kind,
            source_id=source.source_id,
            status="partial",
            entity_count=0,
            error="AI enrichment timed out. No deterministic entities were found yet; retry enrichment when convenient.",
        )
        database.commit()
        return {
            "company_id": company_id,
            "source_kind": source.kind,
            "source_id": source.source_id,
            "created": 0,
            "linked": 0,
            "model": get_ollama_model(),
            "pending_documents": pending_document_count(database, company_id),
            "partial": True,
            "ai_enriched": False,
            "warning": "AI enrichment timed out. No deterministic entities were found yet; retry enrichment when convenient.",
            "message": f"Saved a partial entity map for {source.title}. AI enrichment can be retried later.",
        }

    created, linked = _persist_candidates(database, company_id, source, cleaned)
    partial = ai_error is not None
    status_value = "partial" if partial else "completed"
    warning = (
        "AI enrichment timed out. GrowthOS kept the deterministic entities it could verify. Retry AI enrichment if you want deeper mapping."
        if partial else None
    )

    _set_extraction_state(
        database,
        company_id=company_id,
        source_kind=source.kind,
        source_id=source.source_id,
        status=status_value,
        entity_count=linked,
        error=warning,
    )
    database.commit()

    if partial:
        message = f"Mapped {linked} verified entities from {source.title}. AI enrichment timed out, so this is a partial map."
    else:
        message = f"Mapped {linked} grounded entities from {source.title}."

    return {
        "company_id": company_id,
        "source_kind": source.kind,
        "source_id": source.source_id,
        "created": created,
        "linked": linked,
        "model": get_ollama_model(),
        "pending_documents": pending_document_count(database, company_id),
        "partial": partial,
        "ai_enriched": not partial,
        "warning": warning,
        "message": message,
    }


def map_document_entities(database: Session, company_id: int, document_id: int) -> dict[str, object]:
    return map_source_entities(database, company_id, _document_source(database, company_id, document_id))


def map_new_document_entities(database: Session, company_id: int, batch_size: int = 1) -> dict[str, object]:
    company = database.get(Company, company_id)
    if company is None:
        raise ValueError("Workspace not found")

    mapped_ids = set(database.scalars(
        select(BusinessEntityExtraction.source_id).where(
            BusinessEntityExtraction.company_id == company_id,
            BusinessEntityExtraction.source_kind == "document",
            BusinessEntityExtraction.status.in_(["completed", "partial"]),
        )
    ).all())

    statement = (
        select(Document)
        .where(Document.company_id == company_id)
        .where(Document.processing_status == "processed")
        .order_by(Document.uploaded_at.desc())
    )
    if mapped_ids:
        statement = statement.where(Document.id.not_in(mapped_ids))
    documents = list(database.scalars(statement.limit(max(1, min(batch_size, 2)))).all())

    processed = 0
    created = 0
    linked = 0
    failures: list[str] = []
    for document in documents:
        try:
            result = map_document_entities(database, company_id, document.id)
            processed += 1
            created += int(result["created"])
            linked += int(result["linked"])
        except (RuntimeError, ValueError) as error:
            failures.append(f"{document.original_filename}: {error}")

    pending = pending_document_count(database, company_id)
    return {
        "company_id": company_id,
        "processed": processed,
        "created": created,
        "linked": linked,
        "failed": len(failures),
        "pending_documents": pending,
        "model": get_ollama_model(),
        "message": (
            "No new processed documents need entity mapping."
            if not documents
            else f"Mapped {processed} document{'s' if processed != 1 else ''}; {pending} remain."
        ),
        "failures": failures,
    }


def queue_entity_rebuild(database: Session, company_id: int) -> dict[str, object]:
    company = database.get(Company, company_id)
    if company is None:
        raise ValueError("Workspace not found")

    database.execute(delete(BusinessEntityExtraction).where(
        BusinessEntityExtraction.company_id == company_id,
        BusinessEntityExtraction.source_kind == "document",
    ))
    database.commit()
    pending = pending_document_count(database, company_id)
    return {
        "company_id": company_id,
        "queued_documents": pending,
        "model": get_ollama_model(),
        "message": f"Rebuild queued safely. {pending} processed document{'s' if pending != 1 else ''} can now be remapped in small batches.",
    }
