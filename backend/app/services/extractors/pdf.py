from pathlib import Path

import pymupdf

from app.services.extractors.base import (
    ExtractionError,
    ExtractionResult,
)


class PDFExtractor:
    """Extract selectable text and page metadata from a PDF."""

    supported_extensions = {".pdf"}
    supported_content_types = {"application/pdf"}

    def extract(
        self,
        file_path: str | Path,
    ) -> ExtractionResult:
        path = Path(file_path)

        if not path.exists():
            raise ExtractionError(
                "The stored PDF file could not be found."
            )

        try:
            with pymupdf.open(path) as pdf_document:
                page_texts: list[str] = []

                for page_number, page in enumerate(
                    pdf_document,
                    start=1,
                ):
                    extracted_page_text = page.get_text(
                        "text",
                        sort=True,
                    ).strip()

                    if extracted_page_text:
                        page_texts.append(
                            f"--- Page {page_number} ---\n"
                            f"{extracted_page_text}"
                        )

                complete_text = "\n\n".join(
                    page_texts
                ).strip()

                if not complete_text:
                    raise ExtractionError(
                        "No selectable text was found in the PDF. "
                        "The document may be scanned and require OCR."
                    )

                return ExtractionResult(
                    text=complete_text,
                    page_count=pdf_document.page_count,
                    character_count=len(complete_text),
                    metadata={
                        "format": "pdf",
                        "pages": pdf_document.page_count,
                    },
                )

        except ExtractionError:
            raise
        except Exception as error:
            raise ExtractionError(
                "The PDF could not be opened or processed."
            ) from error
