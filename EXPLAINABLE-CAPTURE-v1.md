# GrowthOS Explainable Capture v1

Changed files only.

## What this adds
- Semantic AI matching between a capture candidate and existing Knowledge Spaces.
- Deterministic safeguards so the active space is only a small tie-breaker.
- Negative mentions such as "nothing to do with Meat Farm" suppress that destination.
- A no-confident-match state instead of forcing a folder.
- A confidence percentage, short reason, grounded evidence, and similar saved item titles.
- A Why?/Hide why control in the capture suggestion.
- Safe bounds: at most 16 spaces, 3 recent items per space, and shortened profile text.
- Local heuristic fallback if the semantic endpoint is unavailable.

## Files
- backend/app/api/routes/knowledge_spaces.py
- backend/app/schemas/knowledge.py
- backend/app/services/capture_recommendation_service.py (new)
- frontend/app/components/CofounderChat.tsx
- frontend/lib/api.ts

## Validation completed
- Python compilation passed.
- TypeScript/TSX syntax transpilation passed.

## Test first
1. Open Meat Farm and produce an unrelated CV summary. It should not recommend Meat Farm.
2. Produce a supplier/compliance response relevant to Meat Farm. It should recommend Meat Farm with a Why? explanation.
3. Test an ambiguous note. It should offer Choose a space before saving rather than force a match.
4. Confirm Save, Change, Dismiss, fade, Escape, and composer-dismiss behavior still work.
