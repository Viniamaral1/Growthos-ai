from __future__ import annotations

import csv
import html
import io
import json
import re
import zipfile
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

from app.services.extractors.base import ExtractionError, ExtractionResult


class _HTMLTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._ignored_depth += 1
        elif tag in {"p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._ignored_depth > 0:
            self._ignored_depth -= 1
        elif tag in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._ignored_depth == 0:
            value = data.strip()
            if value:
                self.parts.append(value)

    def text(self) -> str:
        joined = " ".join(self.parts)
        joined = re.sub(r"[ \t]+", " ", joined)
        joined = re.sub(r"\n\s*\n+", "\n\n", joined)
        return html.unescape(joined).strip()


def _result(text: str, file_format: str, **metadata: object) -> ExtractionResult:
    clean = text.strip()
    if not clean:
        raise ExtractionError("No readable text was found in this file.")
    return ExtractionResult(
        text=clean,
        page_count=None,
        character_count=len(clean),
        metadata={"format": file_format, **metadata},
    )


class PlainTextExtractor:
    supported_extensions = {".txt", ".md", ".log", ".rtf"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        raw = path.read_bytes()
        for encoding in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ExtractionError("The text encoding could not be detected.")

        if path.suffix.lower() == ".rtf":
            text = re.sub(r"\\'[0-9a-fA-F]{2}", " ", text)
            text = re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", text)
            text = text.replace("{", " ").replace("}", " ")
        return _result(text, path.suffix.lower().lstrip("."))


class CSVExtractor:
    supported_extensions = {".csv", ".tsv"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        raw = path.read_text(encoding="utf-8-sig", errors="replace")
        delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
        reader = csv.reader(io.StringIO(raw), delimiter=delimiter)
        rows: list[list[str]] = []
        for index, row in enumerate(reader):
            if index >= 500:
                break
            rows.append([cell.strip() for cell in row[:50]])
        if not rows:
            raise ExtractionError("The spreadsheet contains no rows.")
        lines = [" | ".join(cell for cell in row) for row in rows]
        return _result("\n".join(lines), "csv", rows=len(rows), columns=max(len(row) for row in rows))


class JSONExtractor:
    supported_extensions = {".json"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ExtractionError("The JSON file is not valid.") from error
        pretty = json.dumps(data, ensure_ascii=False, indent=2)
        return _result(pretty[:500_000], "json", root_type=type(data).__name__)


class HTMLExtractor:
    supported_extensions = {".html", ".htm"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        parser = _HTMLTextParser()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        return _result(parser.text(), "html")


class EmailExtractor:
    supported_extensions = {".eml"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
        headers = [
            f"Subject: {message.get('subject', '')}",
            f"From: {message.get('from', '')}",
            f"To: {message.get('to', '')}",
            f"Date: {message.get('date', '')}",
        ]
        bodies: list[str] = []
        parts = message.walk() if message.is_multipart() else [message]
        for part in parts:
            content_type = part.get_content_type()
            if content_type not in {"text/plain", "text/html"}:
                continue
            try:
                content = part.get_content()
            except Exception:
                payload = part.get_payload(decode=True) or b""
                content = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
            if content_type == "text/html":
                parser = _HTMLTextParser()
                parser.feed(str(content))
                content = parser.text()
            if str(content).strip():
                bodies.append(str(content).strip())
        return _result("\n".join(headers + ["", *bodies]), "eml")


class DOCXExtractor:
    supported_extensions = {".docx"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        try:
            with zipfile.ZipFile(path) as archive:
                xml_data = archive.read("word/document.xml")
        except (zipfile.BadZipFile, KeyError) as error:
            raise ExtractionError("The Word document could not be opened.") from error
        root = ElementTree.fromstring(xml_data)
        namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        paragraphs: list[str] = []
        for paragraph in root.iter(f"{namespace}p"):
            text = "".join(node.text or "" for node in paragraph.iter(f"{namespace}t")).strip()
            if text:
                paragraphs.append(text)
        return _result("\n\n".join(paragraphs), "docx", paragraphs=len(paragraphs))
