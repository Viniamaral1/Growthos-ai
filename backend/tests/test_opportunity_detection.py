import base64
import json

from app.services.opportunity_detection_service import (
    Candidate,
    _decode_tag,
    _merge_duplicate_candidates,
    _number,
    _parse_business_date,
    _pct,
    _source_evidence,
)


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


def test_duplicate_renewal_candidates_merge_evidence():
    base = dict(
        opportunity_type="contract_renewal_review",
        title="Renewal status check: Contract end",
        summary="Contract end passed.",
        confidence=96,
        confidence_factors=[],
        severity="warning",
        space_id=4,
        space_name="HarborFresh Catering",
        current_value="31 July 2026",
        previous_value=None,
        delta_display="12 days past",
        delta_percent=None,
        explanation=["Renewal milestone detected."],
        business_impact="Status needs confirmation.",
        recommended_action="Confirm agreement status.",
        entities=[],
    )
    first = Candidate(signature="a", evidence=[{"knowledge_item_id": 1, "document_id": 10, "role": "current", "value": "31 July 2026"}], **base)
    second = Candidate(signature="b", evidence=[{"knowledge_item_id": 2, "document_id": 11, "role": "current", "value": "31 July 2026"}], **base)
    merged = _merge_duplicate_candidates([first, second])
    assert len(merged) == 1
    assert len(merged[0].evidence) == 2
    assert merged[0].confidence == 96
