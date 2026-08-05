GrowthOS Semantic Search v2 — Safe Update

Copy only the five files in this ZIP, preserving their folder paths.

Changes:
- Search Knowledge and Executive Team separately.
- Search starts only when Search is clicked or Enter is pressed.
- Cancel button aborts the browser request.
- Escape cancels an active search, then closes the dialog.
- Maximum 50 candidates per search.
- Maximum 2,000 characters processed per candidate.
- Maximum 8 returned results.
- Optional current Knowledge Space-only search.
- No unrelated GrowthOS files were changed.

Important:
The Cancel button stops the frontend waiting for the response. Because the current backend
search endpoint is synchronous, work already started in the backend may finish in the
background, but the strict candidate limits make that work substantially smaller.
