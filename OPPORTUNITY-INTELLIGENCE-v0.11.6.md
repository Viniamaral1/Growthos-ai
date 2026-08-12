# GrowthOS v0.11.6 — Opportunity Intelligence UX + Stability

## What changed

- Fixed the Toast render loop that could trigger `Maximum update depth exceeded` and page twitching.
- Added a project selector directly to Opportunity Intelligence.
- Added last-reviewed and latest-Knowledge timestamps for each project scope.
- Improved empty-state feedback when no opportunities are found.
- Made confidence and status badges inspectable.
- Added collapsible evidence/confidence sections.
- Added clearer impact presentation and created/updated timestamps.
- Added opportunity-only Move and Delete actions with explicit preservation warnings.
- Added Knowledge → Opportunity handoff after Knowledge capture.
- Added a non-persisting Opportunity preview endpoint so GrowthOS can explain whether newly captured Knowledge currently supports an opportunity without silently saving one.
- Preserved the manual Opportunity Review policy: previewing after capture does not create or confirm opportunities.

## Knowledge → Opportunity handoff

After Knowledge is saved, GrowthOS now checks the selected project and explains one of two outcomes:

1. **Possible opportunity found** — shows possible findings and their confidence, then lets the user open Opportunity Intelligence and explicitly run a full review.
2. **No opportunity saved** — explains why GrowthOS did not create a finding and confirms the Knowledge remains useful even without an opportunity.

## Important lifecycle behaviour

Deleting an Opportunity deletes the finding only. It does **not** delete Business Intelligence source files, Knowledge, supporting evidence, or Business Graph relationships. If the evidence still supports the same signal, a later review may surface it again.

Moving an Opportunity changes only the opportunity's project assignment. It does not silently move its source Knowledge.

## Focused tests

1. Trigger several success/error toasts and confirm there is no `Maximum update depth exceeded` error.
2. Switch between Knowledge and Opportunities repeatedly and confirm visible page twitching is gone/reduced.
3. Capture new Knowledge and confirm the Knowledge → Opportunity handoff appears.
4. For unrelated Knowledge, confirm the handoff says no opportunity was saved and explains why.
5. For historical commercial changes, confirm the handoff shows possible opportunity signals without silently creating/confirming them.
6. Open Opportunities, select a project from the new selector, and confirm the scope changes correctly.
7. Click confidence and status badges and confirm their explanations appear.
8. Expand Why/Evidence and verify current vs historical evidence values remain distinct.
9. Confirm Created / Updated / Last reviewed timestamps are visible.
10. Move an opportunity and confirm only the opportunity moves.
11. Delete an opportunity and confirm Knowledge/source files remain intact.
12. Run an Opportunity Review with no supported signals and confirm the empty state explains what happened and when the last review ran.
