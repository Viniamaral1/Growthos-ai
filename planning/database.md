
## Step 5 — `planning/database.md`

Add:

```markdown
# GrowthOS Future Database Design

## Workspace

Represents a business idea or existing company.

Fields:

- id
- name
- workspace_type
- idea_summary
- problem_statement
- solution_summary
- industry
- country
- region
- city
- target_audience
- business_model
- launch_budget
- primary_goal
- brand_tone
- created_at
- updated_at

## Document

Existing document model.

Belongs to:

- workspace

## Dataset

Represents an uploaded CSV or Excel file.

Fields:

- id
- workspace_id
- original_filename
- file_type
- row_count
- column_count
- processing_status
- uploaded_at

## DatasetColumn

Stores detected column metadata.

Fields:

- id
- dataset_id
- name
- detected_type
- null_count
- unique_count
- minimum_value
- maximum_value
- average_value

## Market

Represents a target market or region.

Fields:

- id
- workspace_id
- country
- region
- city
- population
- target_population
- opportunity_score
- competition_score
- demand_score
- risk_score

## CustomerSegment

Fields:

- id
- workspace_id
- name
- description
- nationality
- location
- age_range
- income_range
- needs
- travel_purpose
- preferred_channels

## Competitor

Fields:

- id
- workspace_id
- name
- location
- website
- products
- strengths
- weaknesses
- estimated_market_position

## Insight

Stores generated or calculated findings.

Fields:

- id
- workspace_id
- insight_type
- title
- summary
- evidence_json
- confidence_score
- created_at

## Recommendation

Fields:

- id
- workspace_id
- title
- description
- priority
- expected_impact
- evidence_json
- status
- created_at

## Campaign

Fields:

- id
- workspace_id
- customer_segment_id
- market_id
- platform
- objective
- content
- status
- created_at