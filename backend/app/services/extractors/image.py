from __future__ import annotations

from pathlib import Path

from PIL import Image

from app.services.extractors.base import ExtractionError, ExtractionResult


class ImageMetadataExtractor:
    supported_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        try:
            with Image.open(path) as image:
                width, height = image.size
                image_format = image.format or path.suffix.lstrip(".").upper()
                mode = image.mode
                frames = getattr(image, "n_frames", 1)
        except Exception as error:
            raise ExtractionError("The image could not be opened.") from error

        text = (
            f"Visual business asset: {path.name}\n"
            f"Image format: {image_format}\n"
            f"Dimensions: {width} x {height} pixels\n"
            f"Colour mode: {mode}\n"
            f"Frames: {frames}\n\n"
            "Image text recognition is not enabled in this local release. "
            "The file is stored and searchable by filename and visual metadata."
        )
        return ExtractionResult(text=text, page_count=None, character_count=len(text), metadata={"format": image_format.lower(), "width": width, "height": height, "frames": frames})
