# Share a Post Into an Existing Chat

## Before

No way to share a post to anyone. `PostCard`'s action row only had like and comment.

## Requested

A share button next to comment, letting you send a post to a friend. Clarified via a quick question: share *into Sphere's own chat* (not a generic OS share sheet) - opens a picker of your existing conversations, sends the post as a message.

## Implemented

### Schema: `Message` can now optionally reference a `Post`

```prisma
model Message {
  ...
  text           String
  sharedPostId   String?
  sharedPost     Post?   @relation(fields: [sharedPostId], references: [id], onDelete: SetNull)
  ...
}
```

`onDelete: SetNull` (not `Cascade`) - if the shared post is later deleted, the chat message survives, just without its post reference, rather than silently deleting someone's chat history. Matching `Post.sharedInMessages Message[]` added as the required back-relation.

### Backend (`server/src/chat/`)

- `chat.service.ts`: `sendMessage()` now takes an optional `sharedPostId`, and the empty-text guard only fires when there's *neither* text *nor* a shared post (`if (!trimmed && !sharedPostId)`). A shared `sharedPostInclude` object (post id, caption, first media item, author) is reused in both `sendMessage` and `listMessages`, so a shared-post message renders identically whether it just arrived live or came from the paginated history fetch.
- `chat.gateway.ts`: `send_message` socket handler now accepts and forwards `sharedPostId` through to the service - no new socket event, no new REST endpoint, reuses the exact same path regular messages already use.

### Frontend

- New `client/src/components/share-modal.tsx` - fetches your existing conversations (`GET /chat/conversations`, already existed), lists them, and on picking one emits `send_message` with `sharedPostId` set.
- `post-card.tsx`: added a Share (paper-plane) button next to comment, opening `ShareModal`.
- `chat/[username]/page.tsx`: the `Message` interface gained an optional `sharedPost` field; a message with one renders as a compact preview card (thumbnail + author + caption) instead of a plain text bubble, and clicking it opens the full post via the same `PostModal` already used everywhere else in the app.

## A real bug found during verification: stale Prisma Client

First live test failed with a genuine `500` on the message-history endpoint. Traced it to the running dev server process still holding the *old* Prisma Client in memory from before the migration - regenerating the client on disk (`npx prisma generate`) doesn't reload an already-imported module in a process that's still running; only a fresh process pickup does. Fixed by restarting the dev server, then re-verified clean.

**Lesson**: after any Prisma schema migration, the running server process needs a real restart, not just a file-watch recompile - the generated client is loaded once at process start.

## Verification

Live Playwright run, two real accounts:
1. Clicked Share on a real post - picker opened, listing an existing conversation.
2. Selected it - success toast shown, message sent via the real socket path.
3. Logged in as the recipient, opened the chat - confirmed the shared post renders as a distinct preview card (author + caption), not a plain text bubble.
4. Clicked the card - confirmed it opened the full post in `PostModal`.
5. `npx tsc --noEmit` clean on both projects.
