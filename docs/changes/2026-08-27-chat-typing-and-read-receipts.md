# Chat: Live Typing Indicator & Read Receipts

## Before

The chat system (built previously — see `2026-08-25-chat-system.md`) had real-time message sending/receiving over a socket.io gateway, but:
- No indication that the other person was typing.
- Messages were marked `read` in the database when you opened a conversation, but the **sender never found out** — no visual confirmation their message had been seen.

## Requested

Add a live "typing..." indicator and a read-receipt indicator (like WhatsApp's ticks) to the chat feature.

## Implemented

### Backend (`server/src/chat/`)

**`chat.service.ts`** — extracted a shared `otherParticipantId()` helper (previously duplicated inline in `sendMessage`) and added `getOtherParticipantId(meId, conversationId)`, which the gateway uses to figure out who to relay a typing event to. `markRead` now returns how many messages it actually flipped to read and who the other participant is, instead of just `{ status: 'ok' }`:

```ts
// before
async markRead(meId: string, conversationId: string) {
  await this.assertParticipant(meId, conversationId);
  await this.prisma.message.updateMany({
    where: { conversationId, senderId: { not: meId }, read: false },
    data: { read: true },
  });
  return { status: 'ok' };
}

// after
async markRead(meId: string, conversationId: string) {
  const conversation = await this.assertParticipant(meId, conversationId);
  const { count } = await this.prisma.message.updateMany({
    where: { conversationId, senderId: { not: meId }, read: false },
    data: { read: true },
  });
  return { status: 'ok', markedCount: count, otherUserId: this.otherParticipantId(conversation, meId) };
}
```

**`chat.gateway.ts`** — two new relay handlers plus a method the controller can call:

```ts
@SubscribeMessage('typing')
async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
  const userId = client.data.userId;
  if (!userId) return;
  const recipientId = await this.chatService.getOtherParticipantId(userId, body.conversationId);
  this.server.to(`user:${recipientId}`).emit('typing', { conversationId: body.conversationId, userId });
}
// stop_typing is the same shape, emits 'stop_typing' instead

notifyRead(conversationId: string, notifyUserId: string) {
  this.server.to(`user:${notifyUserId}`).emit('messages_read', { conversationId });
}
```

**`chat.controller.ts`** — now injects `ChatGateway` (a valid dependency direction: Controller → Gateway → Service, no cycle) so the REST mark-read endpoint can trigger a real-time notification to the *other* person:

```ts
@Post('conversations/:id/read')
async markRead(@Req() req: any, @Param('id') id: string) {
  const result = await this.chatService.markRead(req.user.userId, id);
  if (result.markedCount > 0) {
    this.chatGateway.notifyRead(id, result.otherUserId);
  }
  return result;
}
```

### Frontend (`chat/[username]/page.tsx`)

- **Typing**: input `onChange` now calls `handleTextChange`, which throttles `socket.emit('typing', ...)` to once per 2s while you're actively typing, and schedules a `stop_typing` emit 2s after you pause. The other side listens for `typing`/`stop_typing`, filtered to the current conversation and sender, and shows a bouncing-dots bubble + "typing..." under the header name — with its own 4s fallback timeout in case a `stop_typing` event never arrives (dropped connection, closed tab mid-type), so the indicator can't get stuck on forever.
- **Read receipts**: each of your own messages already carries `read: boolean` from the API. On `messages_read`, every message you've sent in that conversation flips to `read: true` locally. The most recent message you sent shows a small `✓` (sent, unread) or blue `✓✓ Seen` (read) underneath it.

## How it works — request flow

**Typing indicator**, tracing one keystroke:
1. You type a character in the chat input on `/chat/mia.codes`. `onChange` fires `handleTextChange`, which — if more than 2s have passed since the last emit — sends `socket.emit('typing', { conversationId })` over your already-open WebSocket connection.
2. On the server, `ChatGateway.handleTyping` receives it, reads `client.data.userId` (set at connection time from your JWT cookie), calls `chatService.getOtherParticipantId()` to look up who the other person in that conversation is, then does `this.server.to('user:<mia's id>').emit('typing', { conversationId, userId: '<your id>' })` — a direct emit to the room mia's socket joined on her own connection, not a broadcast to everyone.
3. On Mia's browser (if she has that same conversation open), her socket receives `typing`, her `onTyping` handler checks the `conversationId` and `userId` match who she's currently chatting with, and sets `isOtherTyping = true` — which renders the bouncing-dots bubble and the "typing..." label under your name, all without her making any request of her own.
4. Two seconds after you stop typing (or immediately if you clear the input), your browser emits `stop_typing` the same way, which clears the indicator on her screen. If that event is ever lost, her own 4-second timeout clears it anyway.

**Read receipt**, tracing one message being seen:
1. Alex sends a message; it arrives on Mia's screen via the existing `new_message` socket event (from the original chat build).
2. Because Mia's conversation page is open, receiving that message triggers her page's existing effect that calls `POST /chat/conversations/:id/read` over plain REST (not the socket) — this is the same call that already ran when she first opened the conversation.
3. On the server, `ChatController.markRead` runs `chatService.markRead()`, which does a Prisma `updateMany` flipping every unread message *from Alex* in that conversation to `read: true`, and returns how many rows it actually changed plus Alex's user id.
4. Since `markedCount > 0`, the controller calls `chatGateway.notifyRead(conversationId, alexId)` — emitting `messages_read` directly to Alex's `user:<id>` room over the socket.
5. Alex's browser (still on the conversation, or wherever it has a socket connection) receives `messages_read`, sets every message he sent in that conversation to `read: true` in local state, and the last one he sent immediately re-renders with the blue `✓✓ Seen` label — with no polling, no refresh, and no action from Alex at all.

## Verification

Two real logged-in sessions again (Alex, Mia), both with the same conversation open:
- Alex typed into the input — confirmed Mia's screen showed both the "typing..." label and the animated dots bubble live, and confirmed it correctly disappeared once Alex cleared the input.
- Alex sent a message — confirmed it appeared on Mia's already-open screen, and, without Mia or Alex doing anything further, confirmed Alex's own last sent message flipped to a blue "✓✓ Seen" label within about a second.
- Hit one unrelated transient error in the server log (a dropped connection to the remote Neon Postgres pool, self-recovered) — not caused by this change, both features worked correctly across it.
