from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class ExtractionResult:
    """Normalised content returned by every GrowthOS extractor."""

    text: str
    page_count: int | None
    character_count: int
    metadata: dict[str, object]


class ExtractionError(Exception):
    """Raised when a supported file cannot be extracted."""


class UnsupportedFileTypeError(Exception):
    """Raised when an extractor has not been implemented yet."""


class DocumentExtractor(Protocol):
    """Contract implemented by every business-asset extractor."""

    def extract(
        self,
        file_path: str | Path,
    ) -> ExtractionResult:
        ...
