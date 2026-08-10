# GrowthOS v0.10.3 — Comparison Intelligence + Knowledge Lifecycle

This patch focuses on the issues found during v0.10.2 testing and adds dependency-aware deletion.

## Comparison fixes

- Dates are compared as dates (for example, `31 days later`) rather than fake percentages.
- Contract / quotation IDs are treated as identifiers, never as numbers.
- Money and quantities still receive numeric and percentage deltas when appropriate.
- Unchanged values remain `Already known` rather than presenting a misleading 0% change.
- The Knowledge Bridge exposes why two facts were compared.

## Intelligent deletion

Before removing a Business Intelligence asset, GrowthOS now checks what depends on it:

- captured Knowledge facts
- Business Graph entity links
- calendar candidates
- tasks / risks
- whether Knowledge is supported by other source documents

The user can choose:

1. **Delete document only (recommended)** — remove the uploaded file, retain captured Knowledge, and mark that the original evidence was deleted.
2. **Delete + unlink evidence** — retain Knowledge but explicitly remove this document as supporting evidence.
3. **Delete everything created only from this document** — remove Knowledge that depends exclusively on this asset. Multi-source Knowledge is kept and only this evidence link is removed.

The Business Graph always removes links that came from the deleted document. Canonical entities remain when another source still supports them.

## Evidence health

Knowledge source/fact views now surface evidence health, including:

- Evidence linked
- Original evidence deleted
- Evidence unlinked
- Multiple supporting sources where available

## Test sequence

1. Re-test a Meat Farm price update: £3.88/kg -> £3.49/kg. Expect a monetary difference and percentage.
2. Re-test 10 August 2026 -> 10 September 2026. Expect `31 days later`, not a percentage.
3. Re-test quotation ID MF-Q-2026-041 -> MF-Q-2026-058. Expect `Reference changed`, no numeric percentage.
4. Delete a document that has captured Knowledge. Confirm the dependency dialog appears before deletion.
5. Choose **Delete document only**. Confirm the file disappears but Knowledge remains and shows that the original evidence was deleted.
6. Use a Knowledge fact supported by more than one source, delete one source, and confirm the Knowledge item remains supported.
7. Choose **Delete everything created only from this document** on a disposable test asset. Confirm exclusive Knowledge disappears while multi-source Knowledge remains.
8. Confirm entity mapping, Knowledge Capture, project routing, Semantic Search and Business Graph still work.

No database migration is required.
