# Keep unsent chat text across reloads (draft persistence)

## Request
"when im typing a message and suddenly the page for any reason reloads or any network issue happens that message is getting disappear" - wanted it kept in the browser's local storage.

## Before
The text in the chat input lived only in React state (`useState`), so a reload lost anything typed but not yet sent. (Sent messages were never affected - they're saved in the database and reloaded from the server on every visit; a first reading of the request as "sent messages vanish" was checked in a real browser and could not be reproduced.)

## Implemented
- Drafts are saved to `localStorage` per conversation, under `sphere_chat_draft:<username>`, on every keystroke, and restored when the chat page opens (only if the input is still empty, so it can never overwrite what you've already started typing).
- The draft is removed when you send the message, or when the input is emptied.
- On logout, all `sphere_chat_draft:*` keys are cleared, so another person using the same browser can't see your unsent text.
- All storage access is wrapped in try/catch (private windows or blocked storage just mean no draft saving, not a crash).
- Only unsent input text goes in storage - never sent or received messages, which stay server-side (privacy, and no stale copy to keep in sync).

## Files changed
- `client/src/app/(main)/chat/[username]/page.tsx`
- `client/src/lib/chat-drafts.ts` (new - key prefix + `clearAllChatDrafts`)
- `client/src/app/(main)/settings/page.tsx` (clears drafts on logout)

## Known limit
If a message is sent while the connection is down, the input is cleared right away and the draft is removed, so a reload before it reaches the server can still lose it. Fixing that needs a proper "sending / failed / retry" state for messages.

## Verification
Playwright: typed a half-written message, reloaded, and the text was back in the input; sending cleared the stored draft; logging out cleared stored drafts. `npx tsc --noEmit` clean. Frontend-only change, so no server restart needed.
