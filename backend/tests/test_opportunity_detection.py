import base64
import json

from app.services.opportunity_detection_service import _number, _pct, _decode_tag


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
