# Chat: Toast Notification on Incoming Message

## Before

An incoming message only surfaced two ways: appearing directly in an already-open conversation, or a bump in the Messages tab's unread badge. If you were anywhere else in the app — `/home`, `/explore`, a different conversation entirely — a new message gave no visible signal beyond that badge, which is easy to miss.

## Requested

When someone messages you, show a toast notification.

## Implemented

### Backend: richer `new_message` payload (`chat.service.ts`)

The socket payload for a sent message previously only carried `senderId`, not enough to show "so-and-so says: ...". `sendMessage` now includes the sender's public info on the created row:

```ts
// before
this.prisma.message.create({ data: { conversationId, senderId: meId, text: trimmed } })

// after
this.prisma.message.create({
  data: { conversationId, senderId: meId, text: trimmed },
  include: { sender: { select: { username: true, avatarUrl: true } } },
})
```

No gateway changes needed — `new_message` already broadcasts whatever `sendMessage` returns, so the richer shape flows through for free.

### Frontend: the toast lives in `bottom-nav.tsx`, not the chat pages

It's mounted on every page in the `(main)` layout, which is exactly where a global "you got a message and you're not looking at it" notification belongs — the chat pages themselves don't need to know about it.

```tsx
const onNewMessage = (message: IncomingMessage) => {
  queryClient.invalidateQueries({ queryKey: ['chat', 'unread-count'] });

  if (message.senderId === me?.id) return;                        // don't toast your own sent message
  if (pathname === `/chat/${message.sender.username}`) return;    // already looking at this exact conversation

  toast(message.sender.username, {
    description: message.text,
    action: { label: 'View', onClick: () => router.push(`/chat/${message.sender.username}`) },
  });
};
```

Two guards matter here:
- **Your own messages don't toast back at you.** `new_message` is deliberately broadcast to both the sender's and recipient's rooms (so a sender's other open tabs stay in sync) — without the `senderId === me?.id` check, sending a message would immediately toast yourself about your own message. Knowing "me" reliably needed a real `GET /users/me` fetch rather than trusting the Redux auth store, for the same reason the profile redirect page does this — the store never rehydrates on a page refresh, so `me?.id` would silently be `undefined` after any reload.
- **The exact conversation you're already viewing is suppressed**, not just "anywhere in `/chat`" — comparing `pathname === /chat/{sender.username}` means if Mia is mid-conversation with Alex and a *different* person, Sam, messages her, she still gets toasted about Sam even though she's somewhere under `/chat`. Only the specific conversation already on her screen is silenced.

## How it works — request flow

1. Alex sends a message to Mia from `/chat/mia.codes`. This goes over the socket exactly as before (`send_message` → `ChatGateway.handleSendMessage` → `chatService.sendMessage`), except the row Prisma returns now has a nested `sender: { username, avatarUrl }` attached.
2. The gateway emits `new_message` with that payload to both `user:<mia's id>` and `user:<alex's id>` (unchanged from the original chat build).
3. On **Mia's** side: wherever she is in the app, `BottomNav`'s socket listener fires. It invalidates the unread-count query (existing behavior), then checks the two guards above. If she's on `/home`, neither guard applies, so `toast()` renders the notification with Alex's username and message text, plus a "View" button.
4. Clicking "View" calls `router.push('/chat/alex_wanders')` — a normal client-side navigation into the conversation, same as clicking a row in the inbox.
5. On **Alex's** side: the same `new_message` event also reaches his own `BottomNav` listener (since he's in the sender's room too), but `message.senderId === me?.id` is true, so the function returns immediately — no toast, no visual effect beyond the unread-count invalidation (which is a no-op for him anyway, since the unread count never counts your own sent messages).

## Verification

Two real sessions: with Mia sitting on `/home`, Alex sent her a message — confirmed the toast appeared with his username, the message text, and a working "View" button. Then, with Mia actively inside the Alex conversation, Alex sent another message — confirmed no toast fired (checked for the absence of any `data-sonner-toast` element, not just visible text, to rule out a stale one). Also confirmed Alex never sees a toast for his own outgoing message.
