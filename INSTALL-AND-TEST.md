# Install and Test

## Install

Copy the project files over the current GrowthOS project. Preserve your own `.env`, database, and uploaded data.

From the project root in PowerShell:

```powershell
Remove-Item -Recurse -Force .\frontend\.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\.pytest_cache -ErrorAction SilentlyContinue
Get-ChildItem . -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem . -Recurse -Include *.pyc,*.pyo,*.tsbuildinfo | Remove-Item -Force -ErrorAction SilentlyContinue
```

Backend:

```powershell
cd backend
.\.venv\Scripts\Activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Hard refresh with `Ctrl + Shift + R`.

## Test order

1. Clear browser site storage once to simulate a first launch. Confirm Dashboard opens.
2. Visit Executive Team and refresh. Confirm Executive Team remains open.
3. Confirm Knowledge appears near the top of the main navigation.
4. Create a Knowledge Space and refresh.
5. Capture an assistant message into the space.
6. Open Settings and change theme/accent. Confirm preview changes before Save.
7. Click Discard preview. Confirm saved appearance returns.
8. Preview again and Save. Refresh and confirm persistence.
9. Change profile name. Save. Confirm dashboard greeting updates.
10. Open conversation history, click outside, and press Escape. Confirm it closes.
11. Open Team while history is open. Confirm history closes.
12. Choose an executive. Confirm Team closes.
13. Stop a long response and click Continue response. Confirm no visible user instruction is added and text continues beneath the partial response.
14. Scroll upward during generation. Confirm GrowthOS does not force-scroll back to the bottom.
15. Confirm the Guide no longer covers dashboard/research controls.
16. Attach the same PDF twice. Confirm duplicate warning/rejection.

## Validation performed in the packaging environment

- Python compilation: passed.
- Conversation orchestrator tests: 7 passed.
- Syntax parsing for all 17 TypeScript/TSX files: passed.
- Full FastAPI import was not completed because `fastembed` is not installed in the packaging environment.
- Full Next.js build was not completed because the available npm registry does not provide one locked dependency (`zod-validation-error@4.0.2`).
