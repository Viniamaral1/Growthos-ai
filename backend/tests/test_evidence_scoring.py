from app.services.evidence_scoring_service import (
    _authority_score,
    _classify_document,
    _consistency_score,
    _corroboration_score,
    _is_superseded,
    _level,
)


class FakeDocument:
    def __init__(self, name: str, text: str = ""):
        self.original_filename = name
        self.extracted_text = text


def test_document_authority_prioritises_signed_contract():
    signed = FakeDocument("Signed Supplier Agreement.pdf", "SIGNED - CURRENT")
    invoice = FakeDocument("August Invoice.pdf", "")
    meeting = FakeDocument("Procurement Meeting Notes.pdf", "")
    assert _classify_document(signed) == "contract"
    assert _authority_score(signed) > _authority_score(invoice) > _authority_score(meeting)


def test_superseded_evidence_receives_low_authority():
    old_quote = FakeDocument("Supplier Quote v1.pdf", "Status SUPERSEDED. Superseded by the signed agreement.")
    assert _is_superseded(old_quote) is True
    assert _authority_score(old_quote) <= 15


def test_corroboration_rewards_multiple_sources():
    one, _ = _corroboration_score(1)
    two, _ = _corroboration_score(2)
    three, _ = _corroboration_score(3)
    assert one < two < three


def test_active_contradiction_reduces_consistency_score():
    clean, _ = _consistency_score(0, 0)
    one, _ = _consistency_score(1, 0)
    many, _ = _consistency_score(2, 0)
    assert clean > one > many


def test_levels_are_human_readable():
    assert _level(90) == "strong"
    assert _level(65) == "moderate"
    assert _level(45) == "weak"
