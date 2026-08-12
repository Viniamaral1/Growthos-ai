import base64
import json

from app.services.opportunity_detection_service import _number, _pct, _decode_tag, _parse_business_date, _source_evidence


def _encode(prefix: str, value: str) -> str:
    encoded = base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")
    return f"{prefix}:{encoded}"


def test_number_parser_handles_currency_and_commas():
    assert _number("£1,998,000") == 1998000.0
    assert _number("£3.49/kg") == 3.49


def test_percent_detects_price_reduction():
    result = _pct(3.88, 3.49)
    assert result is not None
    assert round(result, 1) == -10.1


def test_encoded_previous_value_round_trip():
    tag = _encode("previous-value-b64", "£3.88/kg")
    assert _decode_tag(tag, "previous-value-b64") == "£3.88/kg"


def test_business_date_parser_handles_long_uk_date():
    parsed = _parse_business_date("31 July 2026")
    assert parsed is not None
    assert parsed.year == 2026 and parsed.month == 7 and parsed.day == 31


def test_source_evidence_preserves_historical_and_current_values():
    class FakeDocument:
        def __init__(self, name):
            self.original_filename = name

    class FakeDatabase:
        def get(self, model, document_id):
            return FakeDocument({1: "January.pdf", 2: "March.pdf"}[document_id])

    class FakeItem:
        id = 7
        title = "Fresh Chicken Fillet price"
        content = "£4.78 per kg"

    tags = ["source-document:1", "source-document:2", "source-quality:direct_document"]
    evidence = _source_evidence(FakeDatabase(), FakeItem(), tags, ["£5.20 per kg"])
    assert evidence[0]["role"] == "historical"
    assert evidence[0]["value"] == "£5.20 per kg"
    assert evidence[1]["role"] == "current"
    assert evidence[1]["value"] == "£4.78 per kg"
