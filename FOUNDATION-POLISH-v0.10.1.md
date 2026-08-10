# GrowthOS Foundation Polish v0.10.1

This package contains only changed application files. Overlay them on the current v0.10.0 Knowledge Bridge stable project, then restart backend and frontend.

## Included fixes/features

1. Permanent Knowledge lifecycle on every processed Business Intelligence asset:
   - Not captured
   - Captured
   - Needs review/update
   - View / update Knowledge
2. Capture to Knowledge is available from every processed asset, independent of project relevance score.
3. Knowledge is grouped by Business Intelligence source/document instead of presenting only a wall of atomic facts.
4. Source Knowledge opens into grouped sections (Finance, Dates, Suppliers, Contracts, etc.) while facts remain individually editable.
5. "Why GrowthOS captured this" and per-fact confidence are visible in the grouped Knowledge view.
6. Project matching v2 adds domain/industry alignment, document-type matching, named-entity signals, and negative mismatch penalties.
7. Explicit negative mentions such as "unrelated to Meat Farm" no longer count as positive project evidence.
8. Project-match percentages now have an expandable contribution breakdown.
9. New project creation has a real busy/disabled state, uses an existing same-name project instead of failing, closes on success, and shows feedback.
10. Modal layering is fixed so Knowledge Bridge / Project Creation / Relevance review appear above the ingestion tray.
11. Dates near meetings, deadlines, renewals, reviews, payments, audits or deliveries are marked as calendar candidates (hook only; no external calendar write yet).
12. Existing duplicate handling and large-file entity partial/fallback mapping remain unchanged.

## First test sequence

1. Restart backend and frontend.
2. Open Business Intelligence and inspect an already processed asset. It should always show a Knowledge section.
3. Capture a supplier contract to Knowledge. Save selected facts.
4. Return to Business Intelligence. The asset should show Captured + fact count.
5. Open Knowledge > the target project. Under All, the captured source should appear as ONE source card. Open it to see grouped facts.
6. Upload/test the NorthStar aquaculture audit against Meat Farm. It should no longer become a high match solely because the text says it is unrelated to Meat Farm. Expand "Why this score?" to inspect the breakdown.
7. Open Create Project and click once. The button should show "Creating project…", be disabled, then close on success. If the name already exists, GrowthOS should reuse it rather than throw a duplicate-name failure.
8. Open Knowledge Bridge while the ingestion tray is visible. The bridge must appear in front of the tray.
9. Capture a document containing a renewal/review/payment/meeting date. The proposed date should show a Calendar candidate label when context supports it.
10. Re-test one previously large entity-map file to confirm partial/fallback behavior is unchanged.

## Notes

- No database migration is required.
- Calendar detection is deliberately a hook only. Writing to Google/Outlook Calendar belongs in the later execution/integration phase.
- Existing Knowledge captured before this version may group under a generic source number if it lacks the new source filename tag. New captures include source filenames.
