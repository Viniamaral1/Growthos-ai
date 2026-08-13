# GrowthOS v0.12.3 — Final UX Cleanup Test Guide

This patch is intentionally frontend/UX focused. The core Opportunity and Contradiction engines were not redesigned.

## 1. Confidence rings
Open Knowledge, Opportunities and Contradictions.

Expected:
- Confidence is shown with a circular radial progress ring.
- The number remains visible in the centre.
- Severity/status remain separate from confidence.
- On Opportunities and Contradictions, clicking the ring opens the confidence explanation.

## 2. Unified Intelligence Review — Knowledge tab
Upload/capture one of the Northstar test documents.

After saving Knowledge, open the Knowledge tab in GrowthOS Intelligence Review.

Expected:
- The Knowledge tab shows the Knowledge records saved by this capture.
- It does not show Opportunity or Contradiction cards in the Knowledge tab.
- Opportunity and Contradiction tabs continue to work independently.

## 3. Contradiction review control
Open Contradiction Intelligence.

Expected:
- The oversized right-side “Hide analysis” control is gone.
- Each card uses a compact “Show review / Hide review” control.
- Review content remains collapsible:
  - Why GrowthOS flagged this
  - Business impact
  - Recommended verification
  - Why this confidence?
  - Evidence

## 4. Evidence inspection
Expand Evidence on a contradiction.

Expected:
- Evidence count is clickable.
- Source A and Source B are shown separately.
- Document name, extracted fact/value, source quality and internal source identifiers are visible.
- The same evidence remains available in Resolution/Delete lifecycle flows.

## 5. Delete wizard footer
Open the contradiction Delete wizard and scroll through a long record.

Expected:
- The content scrolls.
- Cancel and Delete/Apply actions remain visible at the bottom.
- TAB should not be required to reach the buttons.
- The destructive button disables while processing.

## 6. Rendering stability
Spend a few minutes switching:
Knowledge → Opportunities → Contradictions → another project → back.

Expected:
- No repeated twitching caused by automatic Opportunity reloads.
- No maximum-update-depth errors.
- No duplicate-key warnings.
- Project changes still trigger the correct data refresh.

## 7. Regression
Verify:
- Opportunity review still runs.
- Contradiction review still runs.
- Resolution wizard still works.
- Delete wizard still works.
- Knowledge deletion still preserves the original Business Intelligence source when that option is selected.
- Historical/superseded and proposal/request negative tests still behave as before.

If all seven pass, this UX/lifecycle cycle can be frozen before moving to the next intelligence layer.
