from app.services.knowledge_bridge_service import _change_metrics, _deterministic_facts, _fact


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


def test_prose_commercial_extraction_normalises_gbp_unit_price_and_payment_terms():
    contract = (
        "Commercial terms Premium A4 recycled paper is supplied at GBP 18.40 per carton. "
        "Payment is due 30 calendar days from a valid invoice. "
        "Agreement ref NOS-2026-041."
    )
    invoice = (
        "Invoice line Premium A4 recycled paper - 100 cartons at GBP 20.10 per carton. "
        "Payment due 14 calendar days from invoice date. Agreement ref NOS-2026-041."
    )
    contract_facts = _deterministic_facts(contract)
    invoice_facts = _deterministic_facts(invoice)

    contract_by_key = {fact.key: fact for fact in contract_facts}
    invoice_by_key = {fact.key: fact for fact in invoice_facts}

    price_key = "finance-unit-price-premium-a4-recycled-paper-carton"
    assert contract_by_key[price_key].value == "GBP 18.40 per carton"
    assert invoice_by_key[price_key].value == "GBP 20.10 per carton"
    assert contract_by_key["commercial-payment-terms"].value == "30 days"
    assert invoice_by_key["commercial-payment-terms"].value == "14 days"
    assert contract_by_key["contract-reference"].value == "NOS-2026-041"


def test_prose_quantity_extraction_uses_same_canonical_key_for_plan_and_signed_scope():
    plan = _deterministic_facts("The rollout plan assumes 1,500 cartons during the first 12 months.")
    signed = _deterministic_facts("The approved annual quantity is 1,200 cartons.")
    plan_fact = next(fact for fact in plan if fact.key == "commercial-annual-quantity-carton")
    signed_fact = next(fact for fact in signed if fact.key == "commercial-annual-quantity-carton")
    assert plan_fact.value == "1,500 cartons"
    assert signed_fact.value == "1,200 cartons"
