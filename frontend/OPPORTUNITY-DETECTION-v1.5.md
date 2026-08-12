# GrowthOS Opportunity Detection v1.5

This patch polishes the Opportunity layer without redesigning the stable Business Intelligence / Knowledge foundation.

## Main changes

- richer, fact-specific opportunity explanations
- Business Impact section on every opportunity
- confidence breakdown with business-friendly factors
- corrected historical/current supporting evidence values
- evidence grouped as Current / Historical / Additional supporting evidence
- explicit contract-renewal review opportunities from renewal / expiry / deadline facts
- persistent opportunity lifecycle statuses: Needs review, Confirmed, Dismissed, Resolved, Expired
- reminder when Knowledge changed after the last completed opportunity review
- GET Opportunity list no longer silently runs a review; analysis only runs when the user chooses Run opportunity review
- reduced Knowledge page project-switch flicker by avoiding duplicate project-list refetches
- more specific recommended actions

## Important behaviour

Capturing Knowledge does not automatically mean an Opportunity exists.

The flow is:

1. Upload source evidence
2. Capture reusable Knowledge
3. GrowthOS marks Opportunity review as potentially stale
4. User runs Opportunity review
5. Only evidence-supported opportunities are surfaced

An unrelated file can therefore appear in Business Intelligence and Knowledge while correctly producing no Opportunity.

## Focused test sequence

1. Open Knowledge and switch projects several times. Verify the page no longer visibly twitches/refetches the project list unnecessarily.
2. Capture an older supplier price and then a newer lower price.
3. Open Opportunities. Verify the New Knowledge reminder appears before running the review.
4. Run Opportunity Review.
5. Confirm the opportunity shows Previous, Current, Business impact, Recommended action, and confidence.
6. Expand Why / evidence. Verify the historical source shows the historical value and the current source shows the current value.
7. Verify confidence factors are understandable and do not expose internal fact-key terminology.
8. Capture a contract renewal / expiry / renewal-decision date and rerun the review. Verify a renewal-status or renewal-review opportunity appears.
9. Confirm one opportunity, mark it Resolved, and verify it remains in history.
10. Capture an unrelated operational schedule. Run review. Verify GrowthOS does not invent a supplier or cost-saving opportunity.

## Validation completed

- Python compileall: passed
- Backend tests: 8 passed
- TypeScript/TSX syntax transpilation for changed files: passed

A new `opportunity_review_states` table is created automatically by SQLAlchemy `create_all` on application start. No manual migration command is required for the current SQLite development setup.
