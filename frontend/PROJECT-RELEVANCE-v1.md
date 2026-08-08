# GrowthOS Project Relevance Gate + Entity Mapping Modes v1

## Purpose
Prevent an unrelated business asset from being silently mapped into the wrong workspace while keeping entity mapping convenient for large batches of uploads.

## New mapping modes

- **Manual** — upload/process normally; entity mapping happens only when the user clicks Map this asset.
- **Suggest automatically** — after upload, GrowthOS checks project fit and asks what to do before entity mapping. This is the recommended default.
- **Automatic** — high-confidence assets are mapped automatically. Medium/low-confidence assets are paused for confirmation.

The selected mode is stored in local browser settings and does not require a database migration.

## Project relevance gate

The relevance check uses local semantic embeddings plus deterministic safeguards. It compares the uploaded asset with the selected workspace profile, Knowledge Spaces, recent Knowledge, and existing asset titles. The asset being checked is excluded from its own workspace profile so it cannot inflate its own score.

For uncertain or low-confidence matches, GrowthOS shows:

- current workspace and match percentage;
- grounded reasons;
- a possible better workspace, when one is materially stronger;
- **Keep here & map**;
- **Move to another workspace** when a better match exists;
- **Keep here, don't map**;
- **Remove**.

Moving is allowed only before an entity map has been completed/partially completed, which prevents stale entity evidence from being left behind in the original workspace.

## Safety/performance behaviour

- No generative LLM call is used for the relevance gate.
- The feature uses the existing local embedding model and a maximum of 12 workspace profiles.
- Automatic mapping happens only for a high-confidence fit.
- If relevance checking fails, GrowthOS leaves the asset unmapped rather than guessing.
- Clicking Map this asset still performs a relevance check; uncertain assets are paused for confirmation.

## Files

Changed:
- backend/app/api/routes/documents.py
- backend/app/schemas/document.py
- frontend/app/page.tsx
- frontend/app/globals.css
- frontend/lib/api.ts

Added:
- backend/app/services/document_relevance_service.py

## First test

1. Restart backend and frontend.
2. Open Business Intelligence.
3. Confirm the new AI entity mapping selector shows Manual / Suggest / Automatic.
4. Leave it on Suggest.
5. In a Meat Farm workspace, upload a clearly relevant Meat Farm contract.
6. Confirm GrowthOS reports a strong project fit and asks whether to map it.
7. Upload a clearly unrelated CV or another project's document.
8. Confirm GrowthOS warns about the project fit instead of silently mapping it.
9. If it suggests another existing workspace, test Move.
10. Set Automatic and upload another clearly relevant contract; it should map automatically only when the relevance level is high.
11. Confirm Semantic Search, Business Graph, Entity Evidence, document upload, and existing entity mapping still work.
