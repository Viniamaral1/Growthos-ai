from app.services.contradiction_detection_service import _classify, _eligible, _is_proposal, _is_superseded, _kind, _material, _num

class Item:
    def __init__(self,title,item_type='fact'):
        self.title=title; self.item_type=item_type

def test_document_classification():
    assert _classify('Signed Supplier Contract.pdf')=='contract'
    assert _classify('March Invoice 104.pdf')=='invoice'
    assert _classify('Board Meeting Minutes.docx')=='meeting'

def test_price_conflict_pair_is_eligible():
    assert _eligible(['contract','invoice'],'price') is True
    assert _eligible(['quotation','quotation'],'price') is False

def test_payment_conflict_pair_is_eligible():
    assert _eligible(['contract','meeting'],'payment_terms') is True

def test_kind_recognises_business_fact_types():
    assert _kind(Item('Fresh Chicken price'))=='price'
    assert _kind(Item('Payment Terms'))=='payment_terms'
    assert _kind(Item('Contract expiry date'))=='date'
    assert _kind(Item('Annual Volume'))=='quantity'

def test_material_numeric_difference():
    assert _material('price','£4.78/kg','£5.15/kg') is True
    assert _material('price','£4.78/kg','£4.78/kg') is False
    assert _num('£1,250.50')==1250.50


def test_invoice_vs_contract_payment_terms_are_eligible():
    assert _eligible(["contract", "invoice"], "payment_terms") is True


def test_signed_scope_and_plan_classification_support_quantity_comparison():
    assert _classify("06_Northstar_Signed_Scope.pdf") == "contract"
    assert _classify("05_Northstar_Scope_Plan.pdf") == "plan"
    assert _eligible(["contract", "plan"], "quantity") is True


class FakeDocument:
    def __init__(self, name: str, text: str):
        self.original_filename = name
        self.extracted_text = text


def test_meeting_request_is_context_not_final_agreement():
    doc = FakeDocument(
        "Northstar Procurement Meeting Note.pdf",
        "The procurement team would like to request 60-day payment terms. The supplier has not accepted this request.",
    )
    assert _is_proposal(doc) is True


def test_superseded_quote_is_historical_context():
    doc = FakeDocument(
        "Northstar Quote v1.pdf",
        "Status SUPERSEDED. This quotation was superseded by the signed supply agreement.",
    )
    assert _is_superseded(doc) is True
