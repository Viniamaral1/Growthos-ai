# GrowthOS Entity Evidence Explorer v1

This update keeps entity extraction unchanged and makes the Business Graph explainable.

## New behaviour

- Entity cards show how many grounded sources support them.
- AI Entities can be filtered by one mapped Business Intelligence document or all mapped assets.
- Selecting an entity loads a dedicated evidence panel.
- The evidence panel shows confidence, supporting sources, extracted evidence text, and related entities.
- Clicking an evidence source navigates to the corresponding Business Graph source object when it is present in the bounded graph view.
- Clicking a related entity opens that entity directly.
- Business Graph remains read-only and does not trigger entity extraction.

## Files changed

- backend/app/api/routes/business_graph.py
- backend/app/schemas/business_graph.py
- backend/app/services/business_graph_service.py
- frontend/app/components/BusinessGraphPanel.tsx
- frontend/app/globals.css
- frontend/lib/api.ts

No database migration is required.

## Suggested test

1. Open Business Graph and filter AI Entities.
2. Confirm entity cards show source counts.
3. Use the Evidence source filter to choose Fake_Meat_Farm_Supplier_Contract.pdf and confirm only entities grounded in that document remain.
4. Switch to Fake_Meat_Farm_Supplier_Contract_2.pdf and confirm its entity set is different.
5. Return to All mapped assets and confirm both sets are visible together.
6. Click MF-2026-027. Confirm the right panel shows the source PDF, confidence and related entities.
7. Click the PDF evidence entry and confirm GrowthOS selects the source document object.
8. Click a related entity and confirm the details panel changes to that entity.
