# GrowthOS Opportunity Detection v1

This is the first Intelligence Layer feature after the v0.10.6 Foundation Complete checkpoint.

## Scope

v1 deliberately uses **internal GrowthOS Knowledge only**. It does not browse the web and does not ask an LLM to invent opportunities.

It looks for durable facts that already contain historical values and surfaces high-value change patterns including:

- supplier/unit-price reduction
- supplier/unit-price increase
- material annual/commercial value change
- payment-term change
- volume commitment change
- commercial date change
- new/superseding quotation or contract reference
- volume versus unit-price trade-off

## Trust model

Every opportunity includes:

- project
- confidence
- previous value
- current value
- numerical impact when applicable
- explanation
- recommended action
- source evidence
- Confirm / Dismiss controls

Dismissed opportunities remain auditable and can be returned to review.

## Test sequence

1. In Meat Farm Knowledge, capture an older quotation.
2. Capture a newer quotation so at least one fact is updated and history is retained.
3. Open **Opportunities** from the sidebar.
4. Click **Run opportunity review**.
5. Confirm a unit-price reduction is shown as a positive opportunity.
6. Confirm a price increase / financial increase is shown as a warning.
7. Expand **Why / evidence** and verify the source document names and current values.
8. Confirm or dismiss an opportunity. Reload the page and verify the status persists.
9. Change the active Knowledge project and verify Opportunity Detection is scoped to that project.
10. Verify no online research is performed in this version.

## Architecture

Opportunity Detection is deterministic over structured Knowledge history. AI/LLM reasoning can be layered on later for richer explanations and market research, but v1 keeps the initial signal generation explainable and auditable.
