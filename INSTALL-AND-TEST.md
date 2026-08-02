# Install and test

## Installation
Use the full-project ZIP in a separate test directory, or copy the changed-files ZIP over the matching project paths.
Preserve your local `.env`, database, uploads, `.venv`, and `node_modules`.

## Clean before starting
```powershell
Remove-Item -Recurse -Force .\frontend\.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\.pytest_cache -ErrorAction SilentlyContinue
Get-ChildItem . -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem . -Recurse -Include *.pyc,*.pyo | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem .\frontend -Recurse -Filter "*.tsbuildinfo" | Remove-Item -Force -ErrorAction SilentlyContinue
```

## Priority tests
1. Stop a long response, click Continue Response, and confirm the same assistant message grows without a visible user continuation message.
2. Stop a response, then type a completely new prompt. Confirm the old Continue Response banner disappears.
3. During streaming, use the mouse wheel over the message area and confirm free scrolling.
4. Collapse the main navigation and verify the metallic tooltip appears once.
5. Open Capture Knowledge and verify type/space are suggested and dropdown text is readable.
6. Open Knowledge > Meat Farm. Test category tabs, full preview, edit, move, delete, Word, Print/PDF, Copy, and Email.
7. Confirm existing conversation routing tests still behave correctly.
