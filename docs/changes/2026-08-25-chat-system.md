# Real-Time Chat (1:1 Direct Messages)

## Before

- No `Conversation`/`Message` model, no chat module, no `/chat` page — `middleware.ts` already reserved `/chat` as a protected route, but nothing existed behind it.
- No WebSocket infrastructure anywhere in the app — every feature so far (feed, notifications badge, etc.) used REST + React Query polling.
- No way to reach another user except viewing their profile/posts.

## Requested

Build a chat system. Two design decisions were made upfront given this was a bigger architectural step than anything built so far:
1. **Real-time delivery via WebSockets**, not polling — a deliberate departure from the rest of the app's REST+poll pattern, chosen because a chat that lags behind a poll interval feels broken in a way a notification badge doesn't.
2. **1:1 direct messages only** — no group conversations (that's a meaningfully bigger data model: membership, adding/removing people, group metadata) — can be layered on top of this later.

Who can message whom was left unrestricted (any authenticated user can message any other user, regardless of follow status) to keep scope contained — worth revisiting if you want DMs gated behind mutual-follow like the profile privacy model.

## Implemented

### Data model (`server/prisma/schema.prisma`)

```prisma
model Conversation {
  id        String    @id @default(cuid())
  user1Id   String
  user2Id   String
  user1     User      @relation("ConversationUser1", fields: [user1Id], references: [id], onDelete: Cascade)
  user2     User      @relation("ConversationUser2", fields: [user2Id], references: [id], onDelete: Cascade)
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([user1Id, user2Id])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id], onDelete: Cascade)
  text           String
  read           Boolean      @default(false)
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt, id])
}
```

One conversation row per unique pair of users, found via `[meId, otherId].sort()` before every lookup/create — that canonical ordering (always store the alphabetically-smaller id as `user1Id`) is what makes `@@unique([user1Id, user2Id])` actually prevent duplicate conversations regardless of who messages whom first. Migrated via `add_chat_models`.

### Backend: REST for state, WebSocket for the live path

**`chat.service.ts`** does the actual work — `getOrCreateConversation` (lazy creation, first message just works, no explicit "start a chat" step), `listConversations` (with last message + per-conversation unread count via `_count`), `listMessages` (paginated, same `limit/offset/total/hasMore` shape as everything else, returned oldest-first for rendering), `sendMessage`, `markRead`, `unreadCount`.

**`chat.controller.ts`** exposes the read/setup side over REST: `GET /chat/conversations`, `GET /chat/unread-count`, `GET /chat/conversations/:username` (get-or-create), `GET /chat/conversations/:id/messages`, `POST /chat/conversations/:id/read`. This is what loads a chat screen and the conversation list.

**`chat.gateway.ts`** handles the one thing that actually needs to be real-time — sending. This is the part that's structurally different from everything else in the app:

```ts
@WebSocketGateway({ cors: { origin: 'http://localhost:3000', credentials: true } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    const token = extractTokenFromCookie(client.handshake.headers.cookie);
    if (!token) { client.disconnect(); return; }
    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string; text: string }) {
    const { message, recipientId } = await this.chatService.sendMessage(client.data.userId, body.conversationId, body.text);
    this.server.to(`user:${recipientId}`).to(`user:${client.data.userId}`).emit('new_message', message);
  }
}
```

**Why the manual cookie parsing**: every other authenticated route in this app goes through Express middleware (`cookie-parser`) and a Passport `AuthGuard('jwt')` that reads `req.cookies.token`. socket.io's handshake bypasses both — there's no Express request object, no Passport guard pipeline. So `handleConnection` does the equivalent by hand: pull the raw `Cookie` header off the handshake, extract `token`, verify it with the same `JwtService`/`JWT_SECRET` the REST side uses (`ChatModule` registers its own `JwtModule.register({ secret: process.env.JWT_SECRET })` — stateless, so a second registration alongside `AuthModule`'s is fine), and disconnect anyone who doesn't pass.

**Why per-user rooms, not per-conversation rooms**: every authenticated socket joins a room named `user:{theirId}` on connect. Sending a message emits to `user:{recipient}` *and* `user:{sender}` — the sender's own other open tabs get the echo too, and there's no separate "join this conversation" step needed before messages start flowing to whichever chat screen (or none) the recipient currently has open.

### Frontend

- **`lib/socket.ts`** (new) — a lazy singleton `getSocket()` wrapping `socket.io-client`, connected with `withCredentials: true` so the `token` cookie rides along on the handshake.
- **`(main)/chat/page.tsx`** — conversation list: avatar, last message preview, per-conversation unread badge, linking to `/chat/{username}`.
- **`(main)/chat/[username]/page.tsx`** — the conversation itself. REST loads the initial history and does the `getOrCreateConversation` lookup; from there it's pure socket: `socket.emit('send_message', ...)` to send, `socket.on('new_message', ...)` to receive, filtered to the current `conversationId`. No optimistic local echo — the sender's own message only appears once the server confirms it back over the socket, so there's a single source of truth instead of two (optimistic local state vs. server state) to keep in sync. Marks the conversation read on open and whenever a new message arrives while it's open.
- **`profile/[username]/page.tsx`** — added a **Message** button (any non-self profile) linking to `/chat/{username}`.
- **`bottom-nav.tsx`** — added a Messages tab with an unread badge. The badge itself is still the same REST-polled pattern as the notifications bell (`GET /chat/unread-count`, refetched every 30s) — but it *also* listens for `new_message` on the global socket and invalidates that query immediately, so in practice the badge updates the moment a message arrives rather than waiting for the next poll. This is the one place client-side where the socket connection is established outside of an open chat screen, since `BottomNav` is mounted on every `(main)` page.

## Verification

Two real logged-in browser sessions (Alex, Mia) end-to-end: Alex opens Mia's profile → clicks Message → sends "Hey Mia, this is a real-time test!" → confirmed it appeared on **Mia's already-open chat screen within 500ms, with no reload** → Mia replies → confirmed Alex received it live the same way → checked `/chat` list shows the correct last-message preview. Server startup log confirms the gateway registered cleanly (`ChatGateway subscribed to the "send_message" message`) alongside all REST routes, with no compile or runtime errors.

## Known gaps / things you may want next

- No message deletion, editing, or typing indicators.
- No "read receipt" shown to the sender (messages are marked `read` in the DB and drive the unread badge, but there's no double-checkmark UI).
- DMs are open to anyone — no restriction based on follow status.
- `handleConnection` disconnects unauthenticated sockets but there's no reconnection/backoff tuning beyond socket.io's defaults — fine for local dev, worth revisiting before any real deployment.
