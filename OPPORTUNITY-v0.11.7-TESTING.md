# GrowthOS v0.11.7 — Opportunity Stability + Lifecycle Polish

Focused regression sequence:

1. Open Knowledge, create/switch projects repeatedly, then move between Knowledge and Opportunities. Confirm there is no `Maximum update depth exceeded` error and no page twitch loop.
2. Run Opportunity Review in HarborFresh. Repeated renewal findings for the same contract milestone should appear as one current opportunity with multiple evidence sources rather than repeated identical cards.
3. Open Business Impact. Confirm the headline impact and the expanded “Why this matters” text are complementary rather than duplicated.
4. Click confidence and status badges. Confirm the existing breakdown/status explanation still works.
5. Check impact presentation. Renewal milestones that are substantially overdue should show stronger attention than low-risk informational changes.
6. Check timestamps: Created and Last analysed should remain visible.
7. Click Delete on an opportunity. The Lifecycle dialog should first inspect linked Knowledge facts, source documents and calendar candidates and list supporting evidence before allowing deletion.
8. Choose “Dismiss instead”. The opportunity should be dismissed, not deleted.
9. Reopen Delete and choose “Delete opportunity only”. The opportunity should disappear while original Business Intelligence documents and captured Knowledge remain intact.
10. Run Opportunity Review again. If evidence still supports a deleted signal, GrowthOS may surface it again; this is expected and is explained in the Lifecycle dialog.
11. Verify price opportunities still show different Historical and Current evidence values.
12. Confirm Opportunity move/project selector, Knowledge → Opportunity handoff, no-opportunity explanations, and status persistence still work.

No database migration is required for this patch.
