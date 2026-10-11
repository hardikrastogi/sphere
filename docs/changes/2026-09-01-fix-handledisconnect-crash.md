# Fix: Unguarded DB Call in `handleDisconnect` Crashing the Server

## Before

`ChatGateway.handleDisconnect` — which runs on every socket disconnect, for any reason (tab close, navigation, network drop) — awaited a database call with no error handling:

```ts
async handleDisconnect(client: Socket) {
  const userId = client.data.userId;
  if (!userId) return;

  const wentOffline = this.presenceService.removeConnection(userId, client.id);
  if (wentOffline) {
    const partnerIds = await this.chatService.getConversationPartnerIds(userId);
    if (partnerIds.length) {
      this.server.to(partnerIds.map((id) => `user:${id}`)).emit('user_offline', { userId });
    }
  }
}
```

If the database was momentarily unreachable at the exact moment a socket disconnected (observed multiple times this session as transient Neon connection drops), the rejected promise had nothing to catch it — an unhandled rejection in Node.js terminates the entire process. One disconnect at the wrong moment took down the whole backend, for every user, until someone manually restarted it. Diagnosed in an earlier session while investigating "have to restart the servers" reports, confirmed by the server actually crashing with this exact stack trace while unrelated verification work was running.

## Requested

Fix the diagnosed bug.

## Implemented

```ts
async handleDisconnect(client: Socket) {
  const userId = client.data.userId;
  if (!userId) return;

  const wentOffline = this.presenceService.removeConnection(userId, client.id);
  if (wentOffline) {
    try {
      const partnerIds = await this.chatService.getConversationPartnerIds(userId);
      if (partnerIds.length) {
        this.server.to(partnerIds.map((id) => `user:${id}`)).emit('user_offline', { userId });
      }
    } catch {
      // Best-effort broadcast - a DB hiccup here should never take down the whole server.
    }
  }
}
```

Same pattern already used in `handleConnection` right above it, which wraps its equivalent database call in try/catch and simply disconnects that one client on failure instead of crashing.

## How it works — request flow

1. A socket disconnects (any reason). socket.io fires `handleDisconnect`.
2. `presenceService.removeConnection` runs synchronously (in-memory, can't fail) — if this was the user's last open tab, `wentOffline` is `true`.
3. The gateway tries to look up their conversation partners to broadcast `user_offline`. If Postgres is reachable, this works exactly as before — no behavior change on the happy path.
4. If the database call throws for any reason, the `catch` swallows it silently. The `user_offline` event for that one disconnect simply doesn't get sent — a minor, self-correcting gap (anyone who missed it will still see the correct offline status next time they load the inbox or open the conversation, since presence is also stamped fresh on every REST response) — instead of the entire Node process exiting.

## Verification

- `npx tsc --noEmit` — clean.
- Restarted the server fresh; started with no errors.
- Regression check with two real logged-in sessions: Alex had the inbox open, Mia logged in (came online — confirmed green dot appeared), then Mia's entire browser context was closed to simulate quitting the app. Confirmed the dot correctly disappeared on Alex's screen, **and** confirmed the server was still running and responding (`GET /` returned 200) immediately after — normal presence behavior is unchanged, and the disconnect path no longer has a bare, unguarded database call.

Note: reproducing the exact original crash condition on demand would require deliberately cutting database connectivity at the precise moment of a disconnect, which isn't something to do against the live Neon database. The fix itself is a minimal, direct application of the same try/catch pattern already proven safe in `handleConnection` — the regression check confirms nothing else broke.
