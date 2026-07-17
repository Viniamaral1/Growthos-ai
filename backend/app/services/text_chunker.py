import re
from dataclasses import dataclass


PAGE_MARKER_PATTERN = re.compile(
    r"--- Page (\d+) ---\s*"
)


@dataclass
class TextChunk:
    """
    One chunk produced from extracted document text.
    """

    chunk_index: int
    page_number: int | None
    text: str
    character_count: int


def split_text_with_overlap(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[str]:
    """
    Split text into overlapping chunks.
    """

    if chunk_size <= 0:
        raise ValueError(
            "chunk_size must be greater than zero."
        )

    if overlap < 0:
        raise ValueError(
            "overlap cannot be negative."
        )

    if overlap >= chunk_size:
        raise ValueError(
            "overlap must be smaller than chunk_size."
        )

    cleaned_text = " ".join(
        text.split()
    )

    if not cleaned_text:
        return []

    chunks: list[str] = []
    start = 0

    while start < len(cleaned_text):
        end = min(
            start + chunk_size,
            len(cleaned_text),
        )

        chunk = cleaned_text[start:end]

        if end < len(cleaned_text):
            final_space = chunk.rfind(" ")

            if final_space > chunk_size // 2:
                end = start + final_space
                chunk = cleaned_text[start:end]

        chunk = chunk.strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(cleaned_text):
            break

        start = end - overlap

    return chunks


def create_document_chunks(
    extracted_text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[TextChunk]:
    """
    Split extracted PDF text while preserving page numbers.
    """

    if not extracted_text.strip():
        return []

    parts = PAGE_MARKER_PATTERN.split(
        extracted_text
    )

    chunks: list[TextChunk] = []
    chunk_index = 0

    if len(parts) > 1:
        for index in range(1, len(parts), 2):
            page_number = int(
                parts[index]
            )

            page_text = parts[
                index + 1
            ]

            page_chunks = split_text_with_overlap(
                text=page_text,
                chunk_size=chunk_size,
                overlap=overlap,
            )

            for chunk_text in page_chunks:
                chunks.append(
                    TextChunk(
                        chunk_index=chunk_index,
                        page_number=page_number,
                        text=chunk_text,
                        character_count=len(
                            chunk_text
                        ),
                    )
                )

                chunk_index += 1

        return chunks

    plain_chunks = split_text_with_overlap(
        text=extracted_text,
        chunk_size=chunk_size,
        overlap=overlap,
    )

    for chunk_text in plain_chunks:
        chunks.append(
            TextChunk(
                chunk_index=chunk_index,
                page_number=None,
                text=chunk_text,
                character_count=len(
                    chunk_text
                ),
            )
        )

        chunk_index += 1

    return chunks