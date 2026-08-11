# GrowthOS v0.10.6 — Project Context & Linked Asset Synchronisation

This is the final foundation patch before the proactive intelligence phase.

## What changed

- Business Intelligence and Knowledge now share the same active project context.
- Choosing a Knowledge project updates the active Business Intelligence/Business Graph project.
- `All Projects` and `Unassigned / Review` remain visual scopes and do not replace the active project.
- Changing a captured document's project no longer silently splits the source and Knowledge.
- The project move dialog now selects a ranked destination first, explains why GrowthOS recommends it, and requires explicit confirmation.
- Captured assets offer three move policies: document + linked Knowledge (recommended), document only, or Knowledge only.
- Existing `View / update` Knowledge actions now display the same loading/blocked state while the Knowledge preview is fetched.

## Focused tests

1. Select Meat Farm in Business Intelligence, open Knowledge, and confirm Meat Farm opens.
2. Select Finance inside Knowledge, return to Business Intelligence, and confirm Finance is the current project.
3. Use `All Projects`, then return to Knowledge. The active project should remain the last real project, not become `All Projects`.
4. On a captured document, choose Change project. Clicking Finance should only select Finance and show its confidence/reasons; nothing moves until `Confirm project change` is clicked.
5. Test all three movement policies and confirm Business Intelligence / Knowledge stay aligned or intentionally split according to the selected policy.
6. Click `View / update` and confirm the button locks and shows `Loading captured Knowledge…` / `Checking destination…` while backend work is in progress.

No database migration is required.
