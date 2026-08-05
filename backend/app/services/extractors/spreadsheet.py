from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from app.services.extractors.base import ExtractionError, ExtractionResult


_NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "p": "http://schemas.openxmlformats.org/package/2006/relationships"}


def _column_number(cell_reference: str) -> int:
    letters = re.match(r"[A-Z]+", cell_reference.upper())
    if not letters:
        return 0
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - 64
    return result - 1


class XLSXExtractor:
    supported_extensions = {".xlsx"}

    def extract(self, file_path: str | Path) -> ExtractionResult:
        path = Path(file_path)
        try:
            with zipfile.ZipFile(path) as archive:
                shared: list[str] = []
                if "xl/sharedStrings.xml" in archive.namelist():
                    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
                    for item in root.findall("a:si", _NS):
                        shared.append("".join(node.text or "" for node in item.findall(".//a:t", _NS)))

                workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
                rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
                rel_map = {item.attrib["Id"]: item.attrib["Target"] for item in rels}
                output: list[str] = []
                sheet_count = 0
                row_count = 0

                for sheet in workbook.findall("a:sheets/a:sheet", _NS)[:20]:
                    name = sheet.attrib.get("name", f"Sheet {sheet_count + 1}")
                    rel_id = sheet.attrib.get(f"{{{_NS['r']}}}id")
                    target = rel_map.get(rel_id or "")
                    if not target:
                        continue
                    sheet_path = target.lstrip("/")
                    if not sheet_path.startswith("xl/"):
                        sheet_path = f"xl/{sheet_path}"
                    root = ElementTree.fromstring(archive.read(sheet_path))
                    output.append(f"--- Sheet: {name} ---")
                    sheet_count += 1
                    for row in root.findall("a:sheetData/a:row", _NS)[:500]:
                        values: list[str] = []
                        for cell in row.findall("a:c", _NS)[:50]:
                            reference = cell.attrib.get("r", "A1")
                            column = _column_number(reference)
                            while len(values) <= column:
                                values.append("")
                            cell_type = cell.attrib.get("t")
                            value_node = cell.find("a:v", _NS)
                            inline_node = cell.find("a:is/a:t", _NS)
                            value = inline_node.text if inline_node is not None else (value_node.text if value_node is not None else "")
                            if cell_type == "s" and value:
                                try:
                                    value = shared[int(value)]
                                except (ValueError, IndexError):
                                    pass
                            values[column] = value or ""
                        output.append(" | ".join(values).rstrip(" |"))
                        row_count += 1
                text = "\n".join(line for line in output if line.strip()).strip()
        except (zipfile.BadZipFile, KeyError, ElementTree.ParseError) as error:
            raise ExtractionError("The Excel workbook could not be opened.") from error

        if not text:
            raise ExtractionError("No readable cells were found in the Excel workbook.")
        return ExtractionResult(text=text, page_count=None, character_count=len(text), metadata={"format": "xlsx", "sheets": sheet_count, "rows": row_count})
