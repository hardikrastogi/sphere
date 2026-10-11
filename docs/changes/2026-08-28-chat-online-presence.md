# Chat: Online/Offline Presence

## Before

No concept of presence anywhere in the app. The chat list and conversation header showed avatars with no indication of whether the other person currently had Sphere open.

## Requested

1. Someone counts as online only while they have Sphere open; closing the app should show them offline.
2. Green dot on the profile photo in the chat section when online; when offline, the dot should just disappear entirely (no "last seen", no gray dot) — like Instagram.

## Implemented

### Backend: a small in-memory presence tracker (`server/src/chat/presence.service.ts`, new file)

```ts
@Injectable()
export class PresenceService {
  private onlineUsers = new Map<string, Set<string>>(); // userId -> set of socket ids

  addConnection(userId: string, socketId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    if (sockets) { sockets.add(socketId); return false; }
    this.onlineUsers.set(userId, new Set([socketId]));
    return true; // this connection just brought them online
  }

  removeConnection(userId: string, socketId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) { this.onlineUsers.delete(userId); return true; } // just went offline
    return false;
  }

  isOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }
}
```

Tracking a *set* of socket ids per user (not just a boolean) matters because one person can have Sphere open in multiple tabs — they should only flip to "offline" once their *last* tab/connection closes, not their first.

**Caveat worth knowing**: this map lives in the Node process's memory. It's correct for the single-instance local dev setup this app runs on, but if this were ever deployed across multiple server instances, each instance would only know about its own connected sockets — presence would need to move to something shared (Redis, which is already a dependency in this app for other things) to stay accurate. Not needed now, worth remembering later.

### Backend: wiring it into the existing gateway (`chat.gateway.ts`)

`handleConnection` (already existed, for JWT verification) now also registers the connection and, only the first time a user comes online, tells their conversation partners:

```ts
async handleConnection(client: Socket) {
  // ...existing JWT verification...
  client.data.userId = userId;
  client.join(`user:${userId}`);

  const cameOnline = this.presenceService.addConnection(userId, client.id);
  if (cameOnline) {
    const partnerIds = await this.chatService.getConversationPartnerIds(userId);
    if (partnerIds.length) {
      this.server.to(partnerIds.map((id) => `user:${id}`)).emit('user_online', { userId });
    }
  }
}
```

A new `handleDisconnect` (the gateway didn't previously implement `OnGatewayDisconnect` at all) does the mirror image — only announces `user_offline` once `removeConnection` confirms that was their *last* open socket.

**Why only notify conversation partners, not everyone**: the dot is only ever shown in the chat section, next to people you've actually messaged. Broadcasting every login/logout to the entire connected user base would be pure waste — instead, `ChatService.getConversationPartnerIds(userId)` (new method, a simple query over the `Conversation` table) gives the exact list of people who could possibly have this user's avatar on screen, and the presence event goes only to their rooms.

### Backend: exposing current state over REST (`chat.service.ts`)

The socket events only cover *changes* — anyone who wasn't already connected when you came online needs to learn your current status some other way, which is exactly what happens when they load the chat list or open a conversation. `listConversations` and `getOrCreateConversation` now stamp `online: this.presenceService.isOnline(otherUser.id)` onto the other participant, computed fresh on every request:

```ts
// listConversations, per conversation:
const otherUser = c.user1Id === meId ? c.user2 : c.user1;
return {
  id: c.id,
  otherUser: { ...otherUser, online: this.presenceService.isOnline(otherUser.id) },
  // ...
};
```

### Frontend

- `chat/page.tsx` (inbox) and `chat/[username]/page.tsx` (conversation header) both render `{otherUser.online && <AvatarBadge className="bg-green-500" />}` inside the existing `<Avatar>` — `AvatarBadge` already existed in `components/ui/avatar.tsx` (a bottom-right positioned, ring-bordered dot, sized relative to the avatar) but was unused anywhere in the app until now; it turned out to already be exactly built for this. Rendering nothing at all when offline (rather than a gray/hidden dot) is what makes it "just disappear."
- Both pages now also listen for `user_online`/`user_offline` on the socket and invalidate their respective React Query cache entries when the event is about the person they're currently looking at — same "invalidate on socket event" pattern already used for new messages and the unread badges elsewhere in this feature.

## How it works — request flow

**Coming online**, tracing Mia opening Sphere:
1. Mia logs in and lands on `/home`. `BottomNav` (mounted on every page in the app) calls `getSocket()`, which opens a WebSocket connection to the server with her `token` cookie riding along.
2. On the server, `ChatGateway.handleConnection` verifies her JWT, joins her socket to room `user:<mia's id>`, then calls `presenceService.addConnection(miaId, socket.id)`. Since this is her only open tab, this returns `true`.
3. The gateway looks up her conversation partners (just Alex, in this case) via `chatService.getConversationPartnerIds` and emits `user_online` to `user:<alex's id>` — reaching Alex's browser only if he's currently connected.
4. If Alex is on `/chat` right now, his page's socket listener catches `user_online`, sees it matches someone in his conversation list, and calls `queryClient.invalidateQueries(['chat', 'conversations'])` — React Query silently refetches `GET /chat/conversations` in the background (no loading flash, since it already has cached data to show while refetching).
5. That fresh response now has `otherUser.online: true` for Mia (computed live from `presenceService.isOnline()` at the moment of the request), so her row re-renders with the green `AvatarBadge`.
6. If Alex *wasn't* connected at the moment Mia came online, he still sees her correctly as online the next time he loads `/chat` or opens her conversation — because both those REST endpoints compute `online` fresh every time, independent of whether he caught the live event.

**Going offline**, tracing Mia closing the tab:
1. Mia closes her browser tab. The TCP connection drops, and socket.io on the server detects the disconnect, firing `ChatGateway.handleDisconnect`.
2. `presenceService.removeConnection(miaId, socket.id)` finds this was her last remaining socket and returns `true`.
3. The gateway again looks up her conversation partners and emits `user_offline` to `user:<alex's id>`.
4. Alex's page invalidates the same query, refetches, and this time `otherUser.online` comes back `false` — the `<AvatarBadge>` simply isn't rendered on the next paint. No "last seen" text, no gray state, it's just gone, matching the requested Instagram-style behavior.

## Verification

Two real sessions again: Alex opened `/chat` before Mia logged in at all, then Mia logged in in a separate browser context — confirmed Alex's inbox picked up the green dot live, with no reload, on both the list row and (after navigating in) the conversation header. Then closed Mia's entire browser context to simulate quitting the app — confirmed Alex's screen lost the green dot within about 2 seconds, with no reload on his end either.
