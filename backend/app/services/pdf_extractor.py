from dataclasses import dataclass
from pathlib import Path

import pymupdf


@dataclass
class PDFExtractionResult:
    """
    Structured result returned after extracting a PDF.
    """

    text: str
    page_count: int
    character_count: int


class PDFExtractionError(Exception):
    """
    Raised when text cannot be extracted from a PDF.
    """


def extract_pdf_text(
    file_path: str | Path,
) -> PDFExtractionResult:
    """
    Extract readable text from every page of a PDF.

    Args:
        file_path:
            Location of the PDF on the server.

    Returns:
        PDFExtractionResult containing text and document statistics.

    Raises:
        PDFExtractionError:
            When the file does not exist, cannot be opened,
            or contains no extractable text.
    """

    path = Path(file_path)

    if not path.exists():
        raise PDFExtractionError(
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

            complete_text = "\n\n".join(page_texts).strip()

            if not complete_text:
                raise PDFExtractionError(
                    "No selectable text was found in the PDF. "
                    "The document may be scanned and require OCR."
                )

            return PDFExtractionResult(
                text=complete_text,
                page_count=pdf_document.page_count,
                character_count=len(complete_text),
            )

    except PDFExtractionError:
        raise

    except Exception as error:
        raise PDFExtractionError(
            "The PDF could not be opened or processed."
        ) from error