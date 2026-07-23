from pathlib import Path

from app.services.extractors.base import (
    DocumentExtractor,
    UnsupportedFileTypeError,
)
from app.services.extractors.pdf import PDFExtractor


PDF_CONTENT_TYPES = {
    "application/pdf",
}

UPCOMING_FILE_TYPES: dict[str, str] = {
    ".docx": "Microsoft Word support is coming in the next release.",
    ".doc": "Legacy Word support is planned after DOCX.",
    ".txt": "Plain-text support is coming soon.",
    ".rtf": "RTF support is coming soon.",
    ".xlsx": "Excel analysis is coming in the structured-data release.",
    ".xls": "Legacy Excel support is planned after XLSX.",
    ".csv": "CSV analytics is coming in the structured-data release.",
    ".pptx": "PowerPoint support is coming soon.",
    ".ppt": "Legacy PowerPoint support is planned after PPTX.",
    ".png": "Image analysis and OCR are coming soon.",
    ".jpg": "Image analysis and OCR are coming soon.",
    ".jpeg": "Image analysis and OCR are coming soon.",
}


def get_extractor(
    filename: str,
    content_type: str | None,
) -> DocumentExtractor:
    """Return the correct extractor or a clear roadmap message."""

    extension = Path(filename).suffix.lower()

    if (
        extension == ".pdf"
        and (
            content_type in PDF_CONTENT_TYPES
            or content_type in {None, "application/octet-stream"}
        )
    ):
        return PDFExtractor()

    if extension in UPCOMING_FILE_TYPES:
        raise UnsupportedFileTypeError(
            UPCOMING_FILE_TYPES[extension]
        )

    raise UnsupportedFileTypeError(
        "This file type is not supported by the Business "
        "Intelligence Hub yet."
    )


def supported_upload_extensions() -> set[str]:
    """Extensions visible in the product roadmap."""

    return {".pdf", *UPCOMING_FILE_TYPES.keys()}
