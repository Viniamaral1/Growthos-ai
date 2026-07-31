# GrowthOS Conversation Core v5

## Core architectural change
A deterministic `Conversation Orchestrator` now runs before persona routing. It decides whether the message is a direct writing request, a new research idea, a continuation, a resume, an exit, or a general task.

## Contamination safeguards
- Writing requests bypass CEO and Research prompts.
- New unspecified ideas do not receive workspace/company context.
- Active research is detached when the user changes task.
- Saved research remains available for deliberate resumption.

## Validation performed
- Python compilation passed for `backend/app`.
- Orchestrator routing assertions passed for writing, new idea, resume, discovery answer, and unrelated question scenarios.

## Files changed
- `backend/app/services/conversation_orchestrator.py` (new)
- `backend/app/services/research_project_service.py`
- `backend/app/api/routes/conversations.py`
