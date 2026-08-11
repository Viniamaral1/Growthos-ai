# GrowthOS v0.10.4 — Delete Lifecycle + Ranked Project Routing

## What changed

1. Fixed the Delete Wizard backend crash caused by `_mark_knowledge_source_deleted()` referencing an undefined `database` variable.
2. Delete dependency counts are now inspectable before deletion. Knowledge facts, graph entities, calendar candidates, and tasks/risks can be expanded to show what will be affected and where Knowledge is stored.
3. Knowledge source-health badges are expandable and show the supporting source document(s), plus deleted/unlinked evidence warnings.
4. Project routing now exposes a ranked project chooser rather than forcing only the top suggested project. Each candidate shows confidence and a short reason.
5. Existing project names are no longer silently reused during Create Project. The user is told to choose the existing project via the routing chooser or enter a different name.
6. Comparison explanations now use business language instead of exposing internal `fact-key` terminology.

## Priority tests

### 1 — Delete document only
Capture Knowledge from one file, click Delete, inspect the dependency cards, then choose **Delete document only**.
Expected: no backend exception; document disappears; retained Knowledge shows original evidence deleted / supporting-source health.

### 2 — Delete + unlink evidence
Use a captured document and choose **Delete + unlink evidence**.
Expected: document disappears; Knowledge remains; the supporting-source status shows evidence unlinked.

### 3 — Cascade deletion
Use a document with some Knowledge supported only by that document and choose **Delete everything created only from this document**.
Expected: exclusive Knowledge is removed; multi-source Knowledge is preserved with only this source removed.

### 4 — Inspect dependencies before deleting
In the Delete Wizard, click Knowledge facts, Graph entities, Calendar candidates, and Tasks / risks.
Expected: each card expands to list the actual affected records, project location where available, and supporting-source counts for Knowledge.

### 5 — Supporting source inspection
Open a grouped source in Knowledge and click the supporting-source badge on a fact.
Expected: source document names appear; deleted/unlinked warnings appear when relevant.

### 6 — Ranked project routing
Upload a file that could plausibly fit more than one project and click **Move / choose project**.
Expected: ranked projects appear from highest to lowest confidence with a short reason; you can choose any project, not only the AI's first suggestion.

### 7 — Existing project safety
Try creating a project with exactly the same name as an existing project.
Expected: GrowthOS does not silently reuse or overwrite it; it asks you to choose the existing project through routing or use a different name.

### 8 — Regression
Verify upload, intelligent ingestion, Capture to Knowledge, comparison intelligence, duplicate handling, Business Graph, Semantic Search, Executive Team, and large-file fallback still work.

## Validation completed

- Python compilation: passed
- Backend tests: 10 passed
- Modified TS/TSX syntax transpilation: passed
- Full frontend type-check was not used because the clean source package intentionally excludes installed React/Next runtime dependencies.
- Database migration: not required
