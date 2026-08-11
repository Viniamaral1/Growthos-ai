# GrowthOS v0.10.5 — Foundation Final Polish

## What changed

### Project-scoped Business Intelligence
The Intelligence Library now supports three visual scopes:
- Current project — only assets assigned to the selected Knowledge project
- All projects — the complete company library
- Unassigned / Review — assets not currently assigned to a project

This is a UI filter only. GrowthOS relevance assessment and routing still compare against the wider workspace.

### Permanent Change Project action
Every processed Business Intelligence asset now shows its current project and a permanent **Change project** action. This remains available after routing, mapping, and Knowledge capture.

### Ranked project picker
Change project opens the existing AI-ranked destination experience with confidence percentages and reasons. The user remains free to choose a lower-ranked project.

### Processing feedback
Project ranking, project moves, Knowledge capture, entity mapping, delete dependency checks, upload processing, and document preview expose disabled/loading states while requests are running.

## Test checklist
1. Select Meat Farm as the target project. Choose Current project. Only Meat Farm assets should appear.
2. Switch to All projects. All Business Intelligence assets should appear again.
3. Switch to Unassigned / Review. Only assets with no project assignment should appear.
4. While viewing Meat Farm, upload a document that better matches Finance. GrowthOS should still be able to recommend Finance — the visual filter must not limit AI routing.
5. Open any processed asset and use Change project. Confirm the ranked picker shows all available projects with percentages/reasons.
6. Move an asset to another project. The card should update and disappear from Current project if it no longer belongs to the selected project.
7. Capture that asset to Knowledge, return to Business Intelligence, and confirm Change project is still available.
8. During project ranking/moving, the relevant action should be disabled and show a processing message.
9. Confirm Delete Lifecycle, Knowledge Bridge, comparisons, duplicate handling, Business Graph, and Semantic Search still work.

## Validation
- No backend files were changed in this patch.
- TypeScript parser check: no TS1xxx syntax errors were reported for app/page.tsx.
- A full frontend typecheck requires the omitted node_modules/React/Next dependencies.
