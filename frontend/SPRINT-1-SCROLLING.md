# Sprint 1 — Executive Team scrolling

## Scope
Only Executive Team scrolling was changed.

## Files changed
- `frontend/app/components/CofounderChat.tsx`
- `frontend/app/globals.css`

## Behaviour changed
- Mouse-wheel and trackpad deltas are applied directly to the Executive Team message container.
- Wheel events no longer depend on the browser choosing the correct nested scroll container.
- User scrolling pauses streaming auto-follow.
- Streaming auto-follow updates the chat container directly instead of using `scrollIntoView`, which could move an outer page/container.
- Touch momentum scrolling and stable scrollbar space are enabled.

## Not changed
- Backend
- Routing/reasoning
- Dashboard
- Settings
- Knowledge
- Tooltips
- Page spacing
- Composer layout

## Install
Copy the `frontend` folder from this ZIP into the root of your stable GrowthOS project and allow the two files to be replaced.

Then stop the frontend, clear only the Next.js cache, and restart:

```powershell
Remove-Item -Recurse -Force .\frontend\.next -ErrorAction SilentlyContinue
cd frontend
npm run dev
```

Use `Ctrl + Shift + R` in the browser.

## Test
1. Open a long Executive Team conversation.
2. Scroll with the mouse wheel while idle.
3. Start a long response and scroll upward while it streams.
4. Confirm GrowthOS does not force you back down.
5. Scroll near the bottom and confirm new text can follow again.
6. Test the Jump to beginning and Jump to latest controls.
7. Confirm Dashboard, Settings, Knowledge and routing look unchanged.

## Validation performed
- `CofounderChat.tsx` TypeScript/TSX transpile: passed.
- Backend Python compile: passed (backend unchanged).
