# GrowthOS Conversation and UX Fixes

This package contains real replacement files based on the reviewed project.

## Modified files

- `backend/app/services/conversation_orchestrator.py`
  - deterministic routing for greetings, writing, utility questions, new research, research answers, resume, and clean general tasks;
  - pauses active research when a different task starts;
  - prevents a vague new idea from inheriting the active workspace.

- `backend/app/services/research_project_service.py`
  - deterministic first question for a new unspecified idea;
  - delivery/courier research asks shipment details first;
  - only one outstanding discovery question can be answered per turn;
  - warmer, shorter transitions;
  - isolated utility response for weather/current-information requests.

- `backend/app/api/routes/conversations.py`
  - utility requests bypass CEO/research prompts;
  - writing and utility responses use isolated context;
  - active research is paused and can later be resumed.

- `frontend/app/page.tsx`
  - collapsible main application navigation, not only the conversation list.

- `frontend/app/components/CofounderChat.tsx`
  - compact executive routing bar;
  - executive cards are hidden until `Team` is opened;
  - compact reset icon resets Auto, Research mode, document scope, and selected document.

- `frontend/app/components/chat/ExecutiveComposer.tsx`
  - larger readable input;
  - grows automatically up to 180 px.

- `frontend/app/globals.css`
  - full-height conversation workspace;
  - fixed bottom-style composer with independent message scrolling;
  - less cramped header and routing controls;
  - desktop main-navigation collapse;
  - improved light-mode panels;
  - subtle status motion with reduced-motion support.

- `backend/tests/test_conversation_orchestrator.py`
  - six deterministic routing tests.

## Validation performed

- Python compilation: passed.
- Six backend routing tests: passed.
- TypeScript/TSX parser validation for the three changed TSX files: passed.
- Full Next.js build was not possible in this environment because the configured npm registry returned 404 for `zod-validation-error@4.0.2`.

## Installation

Copy the files into the same relative paths in your project and replace the existing versions.

Clean caches from the project root:

```powershell
Remove-Item -Recurse -Force .\frontend\.next -ErrorAction SilentlyContinue
Get-ChildItem .\backend -Directory -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem .\backend -Recurse -Include *.pyc | Remove-Item -Force -ErrorAction SilentlyContinue
```

Run backend tests:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m unittest tests/test_conversation_orchestrator.py -v
```

Then start the backend and frontend normally.

## Test order

Use a new conversation with Auto selected and Search all intelligence off.

1. `Hi`
   - natural greeting only.
2. `I have an idea.`
   - asks what the idea is; must not mention BSL.
3. Answer with a short description.
   - asks the next relevant question only.
4. `Write me a polite email to a supplier asking for a quotation.`
   - writes the email directly and pauses research.
5. `Continue my research project.`
   - resumes the paused idea.
6. New conversation: `I need to compare courier companies for shipping a pallet from London to Manchester.`
   - first question asks what is being sent and its approximate weight/size.
7. While research is active: `What's the weather?`
   - does not produce a CEO/BSL assessment.
8. Click the main navigation collapse control.
   - the Dashboard/Executive Team navigation collapses to icons.
9. Open `Team`, select a role, then click the reset icon.
   - returns to Auto and clears Research/document scope.
