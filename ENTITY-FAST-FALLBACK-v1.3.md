# GrowthOS Entity Intelligence v1.3 — Fast + Fallback

## Changed files

- `backend/app/services/entity_extraction_service.py`
- `backend/app/services/business_graph_service.py`
- `frontend/app/page.tsx`
- `frontend/app/globals.css`
- `frontend/lib/api.ts`

## What changed

Entity mapping now runs a conservative deterministic extraction pass first for explicit business values such as money, dates, contract IDs, labelled suppliers/customers/products/people/locations, and named organisations.

Ollama is then used only for a small enrichment request. The AI request is bounded to one asset, about 1,200 characters, 320 output tokens, a 2,048 token context, temperature 0, and a 12-second timeout.

If Ollama times out but deterministic entities were found, mapping is saved as `partial` instead of failing. The document card shows the verified entity count and offers `Retry AI enrichment`. Existing deterministic entities remain available to the Business Graph.

If neither deterministic extraction nor AI enrichment produces anything, the request still reports a genuine failure.

The Business Graph treats both `completed` and `partial` documents as mapped so partial success does not remain in the pending count.

## First test

Use the fake Meat Farm supplier contract. Click `Map this asset` once. Expected behavior:

1. The request should return without a 503 if explicit entities can be extracted.
2. If Ollama finishes, the card shows a normal mapped state.
3. If Ollama times out, the card shows a partial map rather than a failure.
4. A `Retry AI enrichment` button remains available.
5. Business Graph should show the verified deterministic entities after refresh.
