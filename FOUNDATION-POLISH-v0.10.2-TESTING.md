# GrowthOS Foundation Polish v0.10.2

This patch focuses on the issues found during the v0.10.1 test pass.

## What changed

- Knowledge extraction now captures more durable business concepts: organisations, contacts, supplier/customer names, quotation IDs, payment terms, annual volume/value, minimum order, delivery frequency, locations, products, risks, actions and dates.
- Money facts use context-specific keys, so a unit price is no longer treated as the same Knowledge fact as an annual contract value.
- Date facts use business context such as Quote Date, Valid Until, Commercial Review Date, Contract Start and Expiry instead of treating every date as one generic `Business date`.
- Knowledge updates keep clean current values. Previous values are stored as history metadata rather than being repeatedly appended into the current content.
- Knowledge Bridge now explains why each fact was identified and shows simple change intelligence for changed numeric values.
- Knowledge source view now retains confidence, source evidence, extraction reasons, calendar reason and previous-value history.
- Capturing a not-yet-captured Business Intelligence asset later reopens project/destination review instead of silently assuming the old project.
- Ingestion now always offers `Create another project`, even when an existing project is suggested.
- Long-running Knowledge and ingestion actions show a working/disabled state to reduce accidental double-click requests.

## Test sequence

1. Open a processed BI asset that has never been captured. Click `Capture to Knowledge`.
   - Expected: GrowthOS first re-checks the project destination and opens Intelligent Ingestion.
   - It should not silently capture into the previously selected project.

2. In the ingestion tray, verify `Create another project` is available even if GrowthOS already suggests an existing project.

3. Capture the Meat Farm updated quotation.
   - Expected proposed facts include supplier/company/contact where present, quotation/reference, unit prices, annual value/volume, payment terms, review/valid dates and location.

4. Compare updated prices with existing Knowledge.
   - £3.88/kg must not be compared with £412,800 simply because both are financial values.
   - Context-equivalent values should be compared to each other.

5. Save changed Knowledge and reopen it.
   - Current value should be clean.
   - Previous values should appear under history rather than being nested repeatedly inside the current value.

6. In Knowledge -> source document -> open the grouped source.
   - Expand `Why GrowthOS captured this`.
   - Each fact should offer `Why / evidence` with confidence, reasoning, source evidence, source quality and calendar reason when relevant.

7. Test a date such as Commercial Review Date.
   - Expected: it is labelled specifically, not only `Business date` when context is available.
   - Calendar candidates should explain why they were flagged.

8. Click a long-running action once.
   - Expected: the relevant button becomes disabled / shows a processing message until completion.

## Regression

Confirm these still work:
- multi-file upload
- project routing
- duplicate detection
- entity mapping / partial fallback
- Business Graph filtering
- Semantic Search
- Knowledge project persistence
- edit/move/delete Knowledge

No database migration is required.
