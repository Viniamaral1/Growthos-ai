# GrowthOS Executive Intelligence v1

## What changed

This release evolves the visible Business Graph into a more executive-facing intelligence view while keeping the graph lightweight and workspace-scoped.

- Adds a deterministic Business Health score and label.
- Adds an executive summary grounded in current workspace records.
- Adds a prioritised recommended next action.
- Turns the top object-count cards into working filters.
- Adds clear-filter behaviour and empty states.
- Prioritises risks and active decisions above strengths and patterns.
- Adds next-action guidance to each insight.
- Makes relationship entries clickable so users can move between connected objects.
- Keeps all calculations bounded and read-only; it does not reprocess documents or create embeddings.

## Files to replace

- `backend/app/schemas/business_graph.py`
- `backend/app/services/business_graph_service.py`
- `frontend/app/components/BusinessGraphPanel.tsx`
- `frontend/app/globals.css`
- `frontend/lib/api.ts`

## What to test

1. Open Business Intelligence Map in a populated workspace.
2. Confirm the Business Health score, label, executive summary, and recommended action appear.
3. Click Documents, Decisions, Memories, Research Tasks, Knowledge Items, and Knowledge Spaces cards.
4. Confirm each card filters the object list and clicking the active card again clears the filter.
5. Confirm the dropdown and metric-card filters remain in sync.
6. Select an object and click a connected object in the relationship panel.
7. Switch workspaces and confirm the score, summary, counts, and objects change.
8. Confirm Semantic Search, Explainable Capture, Universal Import, and Executive Team still work.

## How the intelligence works

This version does not use reinforcement learning or train a new model. It uses deterministic scoring over stored workspace facts:

- processed sources increase evidence strength;
- captured Knowledge increases reusable context;
- executive memories increase continuity;
- unresolved high-risk research gaps reduce health;
- active decision backlog reduces health.

The summary and actions are generated from these stored facts rather than invented by an LLM. This makes the first executive intelligence layer fast, explainable, and stable. Future versions can add AI entity extraction and semantic relationship discovery on top of this deterministic foundation.
