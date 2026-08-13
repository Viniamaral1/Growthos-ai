# GrowthOS v0.13.0 — Evidence Scoring v1 Test Guide

This is the first Evidence Intelligence cycle.

The goal is not to generate another AI confidence percentage. GrowthOS now scores the quality of the evidence supporting each Knowledge fact using an auditable deterministic model.

## Scoring model

Each Knowledge fact is scored out of 100 using:

- Source authority — 30 points
- Source quality / provenance — 20 points
- Evidence freshness — 15 points
- Corroboration — 20 points
- Cross-source consistency — 15 points

This is deliberately separate from:
- AI/model confidence
- Opportunity impact
- Contradiction severity

## Test 1 — Evidence Intelligence page

Open **Evidence Intelligence** from the left navigation.

Expected:
- Project selector is visible.
- Current project follows the shared GrowthOS project context.
- Summary shows average evidence strength and counts for Strong / Moderate / Weak / Multi-source / Open conflicts.
- No page twitching or render-loop warnings.

## Test 2 — Signed/current contract evidence

Use the Northstar project and locate Knowledge captured from the signed/current agreement.

Expected:
- It should score relatively strongly.
- Source authority should be high.
- Open the score and inspect the five factor contributions.
- Supporting source should identify the signed agreement as a contract/current source.

## Test 3 — Invoice evidence

Inspect a Knowledge fact sourced from the Northstar invoice.

Expected:
- Invoice should receive strong but normally lower authority than a signed/current contract.
- The score breakdown should make that difference understandable.

## Test 4 — Superseded quotation

Inspect Knowledge backed by the superseded Northstar quotation.

Expected:
- The source should be labelled **Superseded**.
- Its authority contribution should be substantially reduced.
- The item should include a caution telling the user to verify the current source.

## Test 5 — Active contradiction penalty

Use the Northstar price/payment facts that have an unresolved contradiction.

Expected:
- `Active contradictions` should be greater than zero.
- Cross-source consistency should lose points.
- The score should explicitly explain that an active contradiction is challenging the fact.

Resolve/dismiss the contradiction and refresh Evidence Intelligence.

Expected:
- The active contradiction count should fall.
- Consistency score should improve.
- Previously reviewed conflicts may still be mentioned as historical context.

## Test 6 — Corroboration

Find a Knowledge fact with one source, then one with two or more supporting documents if available.

Expected:
- One source receives limited corroboration points.
- Two sources score higher.
- Three or more sources receive the strongest corroboration contribution.
- GrowthOS should not simply reward duplicate copies of the same document as independent authority.

## Test 7 — Evidence age

Inspect the `days since latest evidence` metadata.

Expected:
- Recent evidence receives stronger freshness scoring.
- Older evidence is flagged for a freshness check rather than silently treated as equally current.

## Test 8 — Project isolation

Switch between Northstar, HarborFresh, Meat Farm and another project.

Expected:
- Evidence results change with the selected project.
- All Projects aggregates company-wide Knowledge.
- Shared project context remains stable.

## Test 9 — Confidence vs Evidence Score

Compare a Knowledge/Opportunity/Contradiction confidence ring with the new Evidence score.

Expected:
- They are clearly different concepts.
- Evidence Intelligence explains that the evidence score is deterministic and auditable.
- Severity/status are not mixed into the evidence score.

## Test 10 — Regression

Quickly verify:
- Business Intelligence loads.
- Knowledge still loads/captures.
- Opportunities still load/review.
- Contradictions still load/review.
- Resolution/Delete workflows still work.
- No new duplicate-key, maximum-update-depth, or twitching issues.

## What to report

Please report:
- Test 1–10 PASS/FAIL
- Screenshots of one Strong score, one score affected by a contradiction, and the superseded-source score
- Any score that feels unreasonable and why

The important question is not “did it show a percentage?” It is:

**Can a business user understand exactly why GrowthOS considers one piece of evidence stronger than another?**
