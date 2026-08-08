# GrowthOS Entity Intelligence v1

## Purpose

This release adds a bounded, user-triggered AI entity map to the existing Business Graph. It extracts named business objects from recent processed workspace records and persists them for fast reuse.

## What it extracts

- People
- Organisations
- Suppliers
- Customers
- Products
- Contracts
- Locations
- Money amounts
- Dates
- Risks
- Opportunities

## Safety and performance

Entity extraction runs only when the user clicks **Map entities with AI**. It uses at most 16 recent sources, clips every source, makes one local Ollama request, accepts no more than 24 validated entities, and stores the result. Opening the Business Graph does not call the LLM.

## UI changes

- New **AI Entities** metric and filter
- New entity nodes and source relationships
- **Map entities with AI** button
- **Refresh data** button
- Refreshes preserve the current filter and selected object
- The page no longer reloads simply because the parent error callback changes identity

## Files changed or added

- backend/app/main.py
- backend/app/models/business_entity.py
- backend/app/api/routes/business_graph.py
- backend/app/schemas/business_graph.py
- backend/app/services/business_graph_service.py
- backend/app/services/entity_extraction_service.py
- frontend/app/components/BusinessGraphPanel.tsx
- frontend/app/globals.css
- frontend/lib/api.ts

## Installation

Copy the files into the same paths and restart the backend. `Base.metadata.create_all()` creates the new `business_entities` table automatically.

## Test

1. Open Business Graph and confirm it still loads normally.
2. Click **Map entities with AI**.
3. Wait for the completion message.
4. Confirm the **AI Entities** card shows a count.
5. Click the card and inspect entities and their source connections.
6. Add an important document, map entities again, and confirm the map updates.
7. Click **Refresh data** and confirm the current filter/selection does not reset unexpectedly.
8. Check Semantic Search, Explainable Capture, uploads, Knowledge, and Executive Team for regressions.
