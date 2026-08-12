# GrowthOS v0.11.8 — Final Opportunity UI Stability Test

This patch is deliberately small. It closes the Opportunity Intelligence cycle by fixing duplicate React keys and making lifecycle evidence inspectable before deletion.

## Test 1 — React key warnings
1. Open Opportunities.
2. Expand Why / evidence on an opportunity with several facts from the same document.
3. Open Delete → Opportunity lifecycle.
4. Scroll through all supporting evidence.
5. Check the browser/Next.js console.

Expected: no `Encountered two children with the same key` warning for current, historical, supporting, or lifecycle evidence rows.

## Test 2 — Evidence rows remain stable
Use the HarborFresh renewal opportunity that previously showed several facts from the same PDF.

Expected: every evidence fact is visible exactly once. No row disappears, flickers, or replaces another row.

## Test 3 — Click lifecycle evidence
1. Open Delete on an opportunity.
2. Under Inspect supporting evidence, click any evidence row.

Expected: an Evidence inspection panel appears and shows the source document, evidence role, business fact, captured value, project, document ID, and Knowledge fact ID when available.

## Test 4 — Click summary counts
Click Knowledge facts / Source documents / Calendar candidates / Direct graph links at the top of the lifecycle wizard.

Expected: the wizard scrolls to the relevant evidence/dependency section so the counts are not dead UI.

## Test 5 — Safe delete regression
Choose Delete opportunity only.

Expected: the opportunity is removed, while source documents, Business Intelligence assets, captured Knowledge, graph information and calendar candidates remain preserved.

## Test 6 — General regression
Verify Opportunity Review, Confirm, Dismiss, Move, confidence explanation, project filtering, and Knowledge handoff still work.

If all six tests pass, freeze Opportunity Intelligence except for genuine bugs and begin Contradiction Detection v1.
