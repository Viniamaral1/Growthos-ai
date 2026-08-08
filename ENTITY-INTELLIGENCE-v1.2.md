# GrowthOS Entity Intelligence v1.2 — Per-Asset Mapping

## Purpose

Entity extraction now belongs to the Business Intelligence asset workflow instead of the Business Graph.

## Behaviour

- Business Graph is read-only.
- There is no normal UI action to map all documents or rebuild the entity index.
- Every Business Intelligence asset shows its own AI entity status.
- A processed asset can be mapped individually with **Map this asset**.
- Mapping calls the existing bounded one-document extraction service only for that selected file.
- Existing entity links from other documents are preserved.
- Successfully mapped assets show the number of extracted entities.
- Failed mappings show an error and a **Try again** action.
- Existing older assets remain **Not analysed** until the user explicitly maps them.

## Files to replace

- `backend/app/api/routes/documents.py`
- `backend/app/schemas/document.py`
- `frontend/app/page.tsx`
- `frontend/app/components/BusinessGraphPanel.tsx`
- `frontend/app/globals.css`
- `frontend/lib/api.ts`

## Restart

Restart the backend and frontend after replacing the files.

No new database migration is required beyond the Entity Intelligence tables already introduced in v1.1.

## Recommended test

1. Open Business Intelligence.
2. Find the newly uploaded fake Meat Farm supplier contract.
3. Confirm its status says **AI entities — Not analysed**.
4. Click **Map this asset**.
5. Confirm GrowthOS processes only that asset and does not attempt to map the other 39 documents.
6. Confirm the card changes to `✓ Mapped` and shows an entity count.
7. Open Business Graph and click **Refresh data**.
8. Filter by **AI Entities** and check for grounded entities from the contract.
9. Confirm the Business Graph no longer contains `Map new files` or `Rebuild entity index` controls.

## Validation performed

- Python files compile successfully.
- Changed TS/TSX files pass TypeScript syntax transpilation.
- A full Next.js production build was not run because the targeted review archive does not contain installed frontend dependencies.
