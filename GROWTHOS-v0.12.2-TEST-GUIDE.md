# GrowthOS v0.12.2 — Unified Intelligence Review + Lifecycle UX

## Focus
This patch joins Knowledge, Opportunity and Contradiction review into one post-capture workflow and adds lifecycle-safe resolution/deletion controls.

## Test 1 — Unified capture review
1. Capture a Northstar document to Knowledge.
2. After saving selected Knowledge, confirm the new Intelligence Review opens.
3. Confirm the top summary shows three tabs: Knowledge, Opportunities, Contradictions.
4. Confirm the Knowledge count matches what was saved.

## Test 2 — Opportunity tab
1. Open Opportunities in the Intelligence Review.
2. Confirm preview signals are shown without being silently confirmed.
3. Click **Save opportunity review**.
4. Confirm buttons block while processing.
5. If opportunities are found, test Confirm and Dismiss from the review.
6. Open the full Opportunities page and confirm the same status persists.

## Test 3 — Contradiction handoff
1. Capture conflicting Northstar Knowledge.
2. Open the Contradictions tab.
3. Confirm it initially says contradictions have not been analysed.
4. Click **Analyse contradictions**.
5. Confirm the button blocks and shows progress.
6. If none are found, confirm a clear no-conflict message.
7. If conflicts are found, confirm Statement A/B, confidence, severity and reason are visible.
8. Test Confirm/Dismiss from the review.

## Test 4 — Contradiction page UX
1. Open Contradiction Intelligence.
2. Expand a conflict.
3. Confirm Why, Business impact, Recommended verification and Evidence are individually collapsible.
4. Confirm Created and Updated timestamps appear.
5. Confirm evidence can be expanded to inspect linked Knowledge and source-document IDs.

## Test 5 — Resolution Wizard
1. Click **Review / Resolve** on a contradiction.
2. Test the five steps: Understand → Evidence → Decide → Impact → Apply.
3. Try one decision such as Source A authoritative.
4. Add an optional note.
5. Apply.
6. Refresh and confirm the decision/status remains visible.

## Test 6 — Contradiction Delete Wizard
1. Click Delete on another contradiction.
2. Confirm the impact preview shows Knowledge facts, source documents, linked opportunities and calendar candidates.
3. Inspect evidence.
4. Test **Delete contradiction only** first.
5. Confirm source PDFs and Knowledge remain.
6. Optional: create a disposable duplicate and test a selected-Knowledge deletion mode.

## Test 7 — Knowledge Delete button
1. Open Knowledge.
2. Confirm standalone Knowledge cards show Delete.
3. Open a Business Intelligence source group and confirm each fact also has Delete.
4. Click Delete.
5. Confirm the lifecycle wizard shows supporting sources, linked Opportunities and linked Contradictions.
6. Delete the Knowledge item only.
7. Confirm the original Business Intelligence document remains.

## Test 8 — Negative semantic tests
Use:
- 04_Northstar_Quote_v1_Historical.pdf (SUPERSEDED)
- 03_Northstar_Internal_Meeting_Request.pdf (request, NOT AGREED)

Run contradiction review.
Expected:
- superseded historical quotation should not become an active contradiction;
- requested 60-day terms should not become a definite 30-vs-60 contradiction.

## Regression
Confirm Business Intelligence, Knowledge, Opportunities, Contradictions and project switching still work without React errors or flicker.
