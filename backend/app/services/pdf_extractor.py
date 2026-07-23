from dataclasses import dataclass
from pathlib import Path

from app.services.extractors.base import ExtractionError
from app.services.extractors.pdf import PDFExtractor


@dataclass
class PDFExtractionResult:
    """Backward-compatible PDF extraction result."""

    text: str
    page_count: int
    character_count: int


class PDFExtractionError(Exception):
    """Backward-compatible PDF extraction exception."""


def extract_pdf_text(
    file_path: str | Path,
) -> PDFExtractionResult:
    """Extract PDF text through the universal extractor layer."""

    try:
        result = PDFExtractor().extract(file_path)
    except ExtractionError as error:
        raise PDFExtractionError(str(error)) from error

    return PDFExtractionResult(
        text=result.text,
        page_count=result.page_count or 0,
        character_count=result.character_count,
    )
