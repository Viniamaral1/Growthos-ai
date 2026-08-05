from pathlib import Path

from app.services.extractors.base import DocumentExtractor, UnsupportedFileTypeError
from app.services.extractors.image import ImageMetadataExtractor
from app.services.extractors.pdf import PDFExtractor
from app.services.extractors.spreadsheet import XLSXExtractor
from app.services.extractors.textual import CSVExtractor, DOCXExtractor, EmailExtractor, HTMLExtractor, JSONExtractor, PlainTextExtractor


_EXTRACTORS: dict[str, DocumentExtractor] = {
    ".pdf": PDFExtractor(),
    ".txt": PlainTextExtractor(),
    ".md": PlainTextExtractor(),
    ".rtf": PlainTextExtractor(),
    ".csv": CSVExtractor(),
    ".tsv": CSVExtractor(),
    ".json": JSONExtractor(),
    ".html": HTMLExtractor(),
    ".htm": HTMLExtractor(),
    ".eml": EmailExtractor(),
    ".docx": DOCXExtractor(),
    ".xlsx": XLSXExtractor(),
    ".png": ImageMetadataExtractor(),
    ".jpg": ImageMetadataExtractor(),
    ".jpeg": ImageMetadataExtractor(),
    ".webp": ImageMetadataExtractor(),
    ".bmp": ImageMetadataExtractor(),
    ".gif": ImageMetadataExtractor(),
}

_UNSUPPORTED_ROADMAP: dict[str, str] = {
    ".doc": "Legacy Word .doc files are not supported. Save the file as .docx first.",
    ".xls": "Legacy Excel .xls files are not supported. Save the file as .xlsx first.",
    ".ppt": "Legacy PowerPoint .ppt files are not supported. Save the file as .pptx first.",
    ".pptx": "PowerPoint import is planned for a later release.",
    ".zip": "ZIP import is not enabled yet. Upload the business files inside the archive instead.",
}


def get_extractor(filename: str, content_type: str | None) -> DocumentExtractor:
    """Return a bounded local extractor for a supported business asset."""
    del content_type
    extension = Path(filename).suffix.lower()
    extractor = _EXTRACTORS.get(extension)
    if extractor is not None:
        return extractor
    if extension in _UNSUPPORTED_ROADMAP:
        raise UnsupportedFileTypeError(_UNSUPPORTED_ROADMAP[extension])
    raise UnsupportedFileTypeError(
        "Unsupported file type. Use PDF, DOCX, XLSX, CSV, JSON, TXT, Markdown, HTML, EML, PNG, JPG, WEBP, BMP or GIF."
    )


def supported_upload_extensions() -> set[str]:
    return set(_EXTRACTORS)
