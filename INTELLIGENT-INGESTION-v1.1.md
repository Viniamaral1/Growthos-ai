# GrowthOS Intelligent Ingestion v1.1

## What changed

- Business Intelligence now has a **Target project** selector populated from the current workspace's Knowledge Spaces.
- Relevance is scored against the selected Knowledge project only. It no longer uses unrelated projects or other workspaces to inflate similarity.
- **Auto-detect best project** compares the available Knowledge projects and recommends the strongest existing destination.
- If no existing project fits well, GrowthOS can suggest and create a new project such as **Recruitment**, **Finance**, **Suppliers & Procurement**, **Marketing**, or **Research**.
- Relevance explanations now use business-language reasons instead of exposing raw shared-term counts.
- The ingestion tray is shown only in Business Intelligence, has separate **Strong / Review / Low fit** filters, a minimise button, and a real close button.
- Resolved files disappear from the pending tray immediately.
- Knowledge remembers the last selected project per workspace and should no longer jump back to the first project during normal refreshes.

## Recommended test

1. Restart backend and frontend.
2. Open Business Intelligence in a workspace containing at least two Knowledge projects.
3. Set Target project to **Meat Farm**.
4. Upload one Meat Farm supplier contract and one unrelated CV together.
5. Confirm the supplier contract scores materially higher for Meat Farm than the CV.
6. Confirm the CV is Review/Low fit, not Strong merely because another project contains CV information.
7. Choose **Auto-detect best project** and upload the CV again. Confirm another existing project is suggested when appropriate, or GrowthOS offers **Create Recruitment** when no strong project exists.
8. Test Strong / Review / Low fit buttons. They should filter, not minimise the tray.
9. Resolve one file using Keep & map / Keep only / Remove. Its card should disappear from the pending tray and counts should update.
10. Click ×. The tray should close completely and should not follow you to Knowledge or Executive Team.
11. Open Knowledge, select Meat Farm, leave the page and return. Meat Farm should remain selected unless it was deleted.

## Important architecture note

Business Intelligence assets are still stored at workspace level in the current database model. The Target project in v1.1 controls relevance and ingestion decisions against Knowledge Spaces without introducing a risky database migration. A future Project Command Centre migration can add permanent document-to-project ownership once that information model is finalised.
