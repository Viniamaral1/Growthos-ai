# GrowthOS Entity Intelligence v1.1 — Incremental Mapping

This update replaces the workspace-wide entity refresh with bounded, source-by-source mapping.

## What changed

- **Map this file with AI** analyses only the selected processed document.
- **Map new files** processes unmapped documents one at a time, with at most three files per UI run.
- **Cancel** stops the frontend from starting another file. A single local Ollama request already in progress may finish server-side, but no full-workspace scan is started.
- **Rebuild entity index** is non-destructive. It clears document mapping status but keeps existing entities visible while documents are remapped incrementally.
- Entity extraction is limited to one source, roughly 2,200 characters, 16 entities, and a smaller model response budget.
- Mapping status is stored in `business_entity_extractions`, so documents that return zero entities are still recorded as completed and are not repeatedly reprocessed.
- `business_entity_sources` stores multiple source links for the same canonical entity, allowing the same supplier/person/contract to connect to multiple files without duplicating the entity.
- Deleting a document removes its entity links and only removes an entity when no other source still supports it.
- The Business Graph now shows `mapped / processed`, pending, and failed document counts.

## Database

No manual migration is required for the current GrowthOS startup pattern. The two new tables are created by `Base.metadata.create_all()` when the backend restarts:

- `business_entity_sources`
- `business_entity_extractions`

The existing `business_entities` table is not altered.

## Install

Replace only the files contained in this ZIP, preserving their paths. Restart the backend after copying the files, then restart the frontend.

## Recommended test

1. Upload and process one test PDF in Business Intelligence.
2. Open Business Graph and select that document.
3. Click **Map this file with AI**.
4. Confirm only that file is analysed and the entity index count increases by one.
5. Upload a second document and click **Map new files**.
6. Confirm the first mapped document is not re-analysed.
7. Map two documents that mention the same supplier and confirm one supplier entity can show connections to both sources.
8. Delete one of those documents and confirm the shared supplier entity remains if the other document still supports it.
9. Use **Rebuild entity index** and confirm existing entities remain visible while the pending count resets.

## Performance note

The expensive action is now a single-document local model call. There is no endpoint in the UI that packages the whole workspace into one Ollama prompt.
