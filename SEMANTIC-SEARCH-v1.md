# Semantic Workspace Search v1

This release adds an isolated semantic-search feature without changing the existing capture, Executive Team, Knowledge layout, document search, or grounded-answer workflows.

## What was added

- A new **Search all** button in the Knowledge header.
- Meaning-based search across:
  - captured Knowledge items in every Knowledge Space;
  - saved user and assistant chat messages.
- Results ranked with FastEmbed cosine similarity.
- A small relevance boost for the currently open Knowledge Space.
- Result previews with source, date, type/role, match score, and full-content preview.
- Escape and outside-click support for closing search and previews.

## Backend

New endpoint:

```text
POST /api/v1/search/workspace
```

The existing `/api/v1/search/semantic` document-search endpoint is unchanged.

## Notes

- No database migration is required for v1.
- Embeddings are generated at search time from a capped set of recent Knowledge and chat records.
- The first semantic search after backend startup can be slower while FastEmbed loads its local model.
- Search requires the same FastEmbed model already used by GrowthOS document search.
