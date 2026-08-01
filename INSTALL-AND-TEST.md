# Install and test

Copy the replacement files into the same paths in your project.

## Clean

```powershell
Remove-Item -Recurse -Force .\frontend\.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\.pytest_cache -ErrorAction SilentlyContinue
Get-ChildItem . -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem . -Recurse -Include *.pyc,*.pyo | Remove-Item -Force -ErrorAction SilentlyContinue
```

## Start backend

```powershell
cd backend
.\.venv\Scripts\Activate
uvicorn app.main:app --reload
```

On first startup SQLAlchemy creates the two new tables automatically.

## Start frontend

```powershell
cd frontend
npm run dev
```

Hard refresh with `Ctrl + Shift + R`.

## Test order

1. Restart the app. It should open on **Intelligence Dashboard**.
2. Open **Settings**, change the name, save, return to Dashboard, and confirm the greeting updates.
3. Upload a profile photo and confirm the top-right avatar updates.
4. Change accent colour and theme, save, refresh, and confirm persistence.
5. Open Executive Team. Send a message and use **Capture** beneath the assistant response.
6. Create a new Knowledge Space called `Meat Farm` from the Capture dialog.
7. Open **Knowledge Spaces** and confirm the captured message is present.
8. Capture another message into the existing `Meat Farm` space.
9. Search inside the space using a word from the captured content.
10. Attach the same PDF twice in one composer. The second attachment should be rejected.
11. Attach a PDF already present in the workspace with the same filename and file size. GrowthOS should ask whether to upload another version.
12. Start generation with an attachment and press Stop. The attachment should remain visible rather than disappearing immediately.
13. Create a new conversation or select a conversation from history. The history drawer should close.

## Important

Email sending, voice, semantic global search, PDF folder export, recurring automation, and true CAG are not included in this release. The new Knowledge Space data model is the foundation for those later capabilities.
