# GrowthOS Business Graph v1

This release adds a read-only Business Graph to the main navigation.

## What it maps

- Workspace profile
- Knowledge Spaces and recent captured Knowledge
- Processed and uploaded business sources
- Decisions
- Executive memories
- Research tasks and evidence gaps

## What it notices

The first version surfaces bounded, evidence-based patterns such as:

- unresolved high-risk research gaps
- active decisions
- processed evidence sources
- the strongest current Knowledge category

It does not reprocess documents, generate embeddings, or scan full conversations. It reads existing workspace records with strict limits, so opening it should remain light on CPU and memory.

## Installation

Replace the existing files and add the new files while preserving their paths. Restart both backend and frontend.

## Test

1. Open **Business Graph** from the main navigation.
2. Confirm counts match the active workspace.
3. Filter by Knowledge, documents, decisions, memories, and research.
4. Select nodes and inspect their relationships.
5. Switch workspaces and confirm the graph changes.
6. Confirm Semantic Search, Explainable Capture, Universal Import, and Executive Team remain unchanged.

## Future phases

- AI entity extraction for people, suppliers, customers, products, contracts, dates, and financial facts
- persisted relationships with user correction
- cross-project graph scope
- conflict and change detection
- proactive executive insights
- source-opening actions from graph nodes
