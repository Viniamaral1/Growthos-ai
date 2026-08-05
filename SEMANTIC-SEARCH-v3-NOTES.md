# GrowthOS Semantic Search v3

Changed application files:

- `backend/app/api/routes/search.py`
- `backend/app/schemas/search.py`
- `frontend/app/components/SemanticWorkspaceSearch.tsx`
- `frontend/app/globals.css`
- `frontend/lib/api.ts`

## Main changes

- Knowledge search remains bounded semantic search.
- Executive Team search no longer generates embeddings from raw chat messages during a search.
- Executive Team uses bounded conversation-summary relevance to avoid memory/CPU crashes.
- Search modes: summaries, most recent conversation, recent 5, recent 20, saved conversations, and full-history summaries.
- Performance settings: Safe, Balanced, Deep summaries.
- Cancel immediately aborts the frontend request and ignores late responses.
- Results use a compact vertical list.
- Search window supports minimise, normal, and full-screen modes.

## Important architecture note

True background vector indexing of complete chat history needs a database model/migration and an indexing worker. Those files were not part of the supplied package, so v3 safely avoids live full-history embedding generation instead of introducing an incomplete migration.
