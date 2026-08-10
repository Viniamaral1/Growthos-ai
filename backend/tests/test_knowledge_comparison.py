from app.services.knowledge_bridge_service import _change_metrics, _fact


def test_date_comparison_uses_days_not_percent():
    fact = _fact("date-review", "Review date", "10 September 2026", "", item_type="date")
    summary, delta, percent, kind, display = _change_metrics(fact, "10 August 2026", "10 September 2026")
    assert kind == "date"
    assert delta is None
    assert percent is None
    assert display == "31 days later"
    assert "Date changed" in summary


def test_identifier_comparison_never_uses_numeric_percent():
    fact = _fact("contract-reference", "Quotation reference", "MF-Q-2026-058", "", item_type="contract")
    summary, delta, percent, kind, display = _change_metrics(fact, "MF-Q-2026-041", "MF-Q-2026-058")
    assert kind == "identifier"
    assert delta is None
    assert percent is None
    assert display == "Reference changed"
    assert "Reference changed" in summary


def test_money_comparison_calculates_like_for_like():
    fact = _fact("finance-unit-price-chicken", "Chicken price", "£3.49/kg", "", item_type="finance")
    _, delta, percent, kind, display = _change_metrics(fact, "£3.88/kg", "£3.49/kg")
    assert kind == "money"
    assert round(delta or 0, 2) == -0.39
    assert round(percent or 0, 1) == -10.1
    assert display == "-£0.39"
