from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.models.document import Document
from app.services.document_classification_service import classify_document
from app.services.document_relevance_service import assess_document_relevance


_KIND_BY_EXTENSION = {
    ".pdf": "PDF document",
    ".doc": "Word document",
    ".docx": "Word document",
    ".rtf": "Rich text document",
    ".txt": "Text document",
    ".md": "Markdown document",
    ".xlsx": "Spreadsheet",
    ".xls": "Spreadsheet",
    ".csv": "Structured data",
    ".tsv": "Structured data",
    ".json": "Structured data",
    ".eml": "Email",
    ".html": "Web document",
    ".htm": "Web document",
    ".png": "Image",
    ".jpg": "Image",
    ".jpeg": "Image",
    ".webp": "Image",
    ".bmp": "Image",
    ".gif": "Image",
}


def _asset_kind(document: Document) -> str:
    return _KIND_BY_EXTENSION.get(
        Path(document.original_filename).suffix.lower(),
        "Business asset",
    )


def _recommended_actions(
    asset_kind: str,
    category: str,
    relevance_level: str,
) -> list[str]:
    actions: list[str] = []

    if relevance_level == "low":
        actions.extend(["Review project destination", "Keep as temporary context or move elsewhere"])
        return actions

    if relevance_level == "medium":
        actions.append("Confirm project destination")

    actions.append("Keep in Business Intelligence")

    if asset_kind not in {"Image"}:
        actions.append("Map business entities")

    if category in {"strategy", "research", "operations"}:
        actions.append("Consider capturing reusable knowledge")
    if category == "finance":
        actions.append("Review financial figures and commitments")
    if asset_kind == "Email":
        actions.append("Review for decisions, actions, and follow-ups")

    return actions[:4]


def assess_intelligent_ingestion(
    database: Session,
    company_id: int,
    document_id: int,
    target_space_id: int | None = None,
) -> dict[str, object]:
    document = database.get(Document, document_id)
    if document is None:
        raise ValueError("Document not found")
    if document.company_id != company_id:
        raise ValueError("Document does not belong to this workspace")
    if document.processing_status != "processed":
        raise ValueError("Process the document before intelligent ingestion")

    classification = classify_document(database, document)
    relevance = assess_document_relevance(database, company_id, document_id, target_space_id=target_space_id)
    asset_kind = _asset_kind(document)

    level = str(relevance["level"])
    if level == "high":
        decision = "strong_match"
    elif level == "medium":
        decision = "review"
    else:
        decision = "unrelated"

    return {
        "document_id": document.id,
        "company_id": company_id,
        "asset_kind": asset_kind,
        "category": classification["category"],
        "classification_confidence": classification["confidence"],
        "classification_signals": classification["signals"],
        "decision": decision,
        "relevance": relevance,
        "recommended_actions": _recommended_actions(
            asset_kind,
            str(classification["category"]),
            level,
        ),
    }
