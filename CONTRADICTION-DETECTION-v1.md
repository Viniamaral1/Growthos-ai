# GrowthOS v0.12.0 — Contradiction Detection v1

## Purpose
Contradiction Intelligence checks captured Knowledge for business facts that cannot safely be treated as simultaneously true.

This first version is deliberately conservative. It focuses on conflicts between different source classes (for example contract vs invoice, contract vs meeting notes, contract vs quotation) and avoids treating ordinary quotation-to-quotation history as a contradiction.

## Initial contradiction types
- Price / commercial value conflicts
- Payment-term conflicts
- Date / expiry conflicts
- Quantity / volume conflicts
- Supplier/reference conflicts where source context supports comparison

## User workflow
1. Capture at least two sources into the same project.
2. Ensure they describe the same business fact with different values.
3. Open **Contradictions**.
4. Click **Run contradiction review**.
5. Review Statement A vs Statement B, confidence, severity, business impact and source evidence.
6. Confirm, Resolve, or Dismiss the finding.

## Recommended first test
Use a signed contract containing a product price of £4.78/kg, then capture an invoice for the same project/product showing £5.15/kg.

Expected result: a high-severity price contradiction explaining that the invoice amount conflicts with the commercial evidence and recommending source verification.

## Important safeguards
- Quote-vs-quote historical changes are intentionally not treated as contradictions in v1.
- Detection remains project-scoped in the UI.
- Findings do not modify Knowledge or source documents.
- User status decisions are persisted.

## Validation
- Python compilation passed.
- 14 focused backend tests passed across contradiction, opportunity, and knowledge comparison tests.
- Changed TypeScript/TSX files passed syntax transpilation checks.
