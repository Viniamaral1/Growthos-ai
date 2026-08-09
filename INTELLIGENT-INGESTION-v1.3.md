# GrowthOS Intelligent Ingestion v1.3

## What changed

### 1. Knowledge Bridge
Business Intelligence remains the original evidence layer. "Capture to Knowledge" now opens a review step instead of copying the whole document into Knowledge.

GrowthOS proposes reusable business facts. The user can:
- select or deselect facts;
- edit titles and values;
- update existing Knowledge when a value changed;
- keep the original asset as evidence only.

Created Knowledge items are tagged with the source document id and a stable fact key so future documents can compare against them.

### 2. Large-file entity resilience
Entity mapping now samples large assets in bounded beginning/middle/end chunks rather than relying on one local LLM request.

If all AI enrichment calls time out and no deterministic entity is found, GrowthOS now saves a partial mapping with zero entities and returns success instead of HTTP 503. The user can retry enrichment later.

### 3. Editable project creation
When Intelligent Ingestion suggests a new project, GrowthOS opens a compact naming dialog. The suggestion is editable before creation.

## Data model
- Original file -> Business Intelligence
- Reusable facts -> Knowledge
- Entities -> Business Graph
- Source asset remains the evidence/provenance layer

No database migration is required for v1.3.

## First test
1. Restart backend and frontend.
2. Upload or use a processed Meat Farm supplier contract.
3. Click Capture to Knowledge.
4. Confirm a Knowledge Bridge dialog appears with proposed facts.
5. Edit/select a few facts and save them.
6. Open Knowledge -> Meat Farm and confirm the selected facts appear as separate Knowledge items, not as a duplicate PDF.
7. Re-run Capture to Knowledge on a newer quotation with a changed price. Confirm GrowthOS marks related knowledge as changed when it can match the fact key/title.
8. Map a large document that previously returned 503. It should now complete or return a partial map, not 503.
9. Trigger Create Project from a low-fit asset. Confirm the suggested name can be edited before creation.
