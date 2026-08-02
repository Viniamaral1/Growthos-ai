# GrowthOS Knowledge UX and Streaming Polish

## Implemented in this build

### Executive Team
- Continue Response now appends into the interrupted assistant message in the live UI instead of creating a visible continuation prompt.
- A normal new user prompt clears any stale Continue Response state.
- The stopped assistant message is tracked after cancellation so the continuation targets the correct message.
- Conversation scrolling keeps native wheel/touch behaviour enabled while streaming.
- Capture Knowledge now preselects a likely content type and suggests an existing Knowledge Space when the message mentions it.

### Main navigation and forms
- Restored a metallic-blue glass tooltip for collapsed navigation.
- Increased left spacing for expanded sidebar labels.
- Fixed dark/light select option contrast in Capture Knowledge and Knowledge edit forms.

### Knowledge
- Rebuilt Knowledge as a subject-and-category browser.
- Added type categories with counts: All, Emails, Ideas, Research, Decisions, Strategy, Tasks, Notes.
- Added a readable full-item preview.
- Added Copy, Word download, Print/Save PDF, Email, Edit, Move, and Delete actions.
- Added persistent backend PATCH and DELETE endpoints for knowledge items.
- Improved search copy so it is clear that search covers title, content, and tags.

## Deliberately not claimed as implemented
- Automatic topic-change banners before every reply.
- Semantic/LLM global search across every chat and document.
- Direct SMTP/Gmail sending (the Email action opens the user's configured mail client with content prepared).
- Native PDF generation on the server (Print / PDF uses the browser print dialog).
- Voice commands.
- True CAG.
