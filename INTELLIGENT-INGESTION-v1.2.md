# GrowthOS Intelligent Ingestion v1.2 — Routing & Data Integrity

This build adds:

- Separate current-project and best-project relevance scores.
- Clearer recommendations when another project is stronger.
- New-project suggestion when no existing Knowledge project is a confident fit.
- Image/metadata caution so generic image metadata cannot become a strong project match.
- Persistent document-to-project routing using a lightweight `document_project_links` table.
- Explicit Knowledge capture from an ingestion review (original file remains in Business Intelligence).
- Exact/same-name duplicate preflight check before upload.
- Business Graph project scope selector (All projects or one Knowledge project).
- Ingestion actions now distinguish Keep & map, Keep only, Capture to Knowledge, Move/review, Create project, Remove.

## Data lifecycle

Original file -> Business Intelligence

Optional structured outputs:
- Project link -> document_project_links
- Entities -> Business Graph
- Reusable text -> Knowledge

The original file is not copied into multiple stores.

## Duplicate behavior

Before upload GrowthOS checks exact content and same filename. The current UI asks whether to use the existing asset, keep another copy, or replace the existing copy.

## Important

Restart the backend after replacing files so SQLAlchemy can create the new `document_project_links` table.
