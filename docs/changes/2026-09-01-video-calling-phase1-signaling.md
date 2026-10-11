# Video Calling Phase 1: Signaling Backend

## Before

No video calling code existed anywhere. Phase 0 (previous session) locked in the decisions: 1:1 calls, STUN-only, persisted call history, separate video/voice entry points.

## Requested

Implement Phase 1 of the roadmap: the signaling backend.

## Implemented

### New `Call` model (`server/prisma/schema.prisma`, migrated via `add_call_model`)

```prisma
enum CallType { VIDEO AUDIO }
enum CallStatus { COMPLETED REJECTED MISSED }

model Call {
  id        String     @id @default(cuid())
  callerId  String
  caller    User       @relation("CallCaller", fields: [callerId], references: [id], onDelete: Cascade)
  calleeId  String
  callee    User       @relation("CallCallee", fields: [calleeId], references: [id], onDelete: Cascade)
  type      CallType
  status    CallStatus
  startedAt DateTime   @default(now())
  endedAt   DateTime?

  @@index([callerId])
  @@index([calleeId])
}
```

### New `calls` module (`server/src/calls/`, new files)

- **`call-state.service.ts`** — `CallStateService`, the in-memory "who's currently ringing/connected" tracker. Same shape as the existing `PresenceService`: a `Map<callId, ActiveCall>` plus a reverse `Map<userId, callId>` index for O(1) "is this person already busy" checks. Nothing here ever touches the database — it only exists while a call is live.
- **`calls.service.ts`** — `CallsService.recordCall(...)` writes a resolved `Call` row; `getPublicUser(userId)` fetches `{ id, username, avatarUrl }` for the invite payload (mirrors how `sendMessage` attaches sender info for the chat toast).
- **`calls.module.ts`** — exports both, imported into `ChatModule`.

### Extended `ChatGateway` (`chat.gateway.ts`) — no new connection/auth mechanism

Six new `@SubscribeMessage` handlers, all reusing the exact `user:<id>` room pattern already built for chat:

```ts
@SubscribeMessage('call_invite')
async handleCallInvite(@ConnectedSocket() client: Socket, @MessageBody() body: { callId, calleeId, type, offer }) {
  const callerId = client.data.userId;
  if (!callerId || body.calleeId === callerId) return;

  if (!this.presenceService.isOnline(body.calleeId)) {
    client.emit('call_unavailable', { callId: body.callId });
    return;
  }
  if (this.callState.isBusy(body.calleeId) || this.callState.isBusy(callerId)) {
    client.emit('call_busy', { callId: body.callId });
    return;
  }

  this.callState.startRinging(body.callId, callerId, body.calleeId, body.type);
  const caller = await this.callsService.getPublicUser(callerId);
  this.server.to(`user:${body.calleeId}`).emit('call_invite', { callId: body.callId, type: body.type, offer: body.offer, caller });
}
```

`handleCallAnswer` and `handleIceCandidate` are pure relays (no DB, no history write). `handleCallReject`, `handleCallTimeout`, and `handleCallEnd` each end the tracked call and write the resolved `Call` row (`REJECTED`, `MISSED`, and `COMPLETED`/`MISSED` respectively — `call_end` while still `RINGING` resolves to `MISSED`, since the callee never actually answered).

`handleDisconnect` was extended (not replaced) to also resolve any call the disconnecting user was in:

```ts
const activeCall = this.callState.getActiveCallForUser(userId);
if (activeCall) {
  this.callState.end(activeCall.callId);
  const otherId = activeCall.callerId === userId ? activeCall.calleeId : activeCall.callerId;
  this.server.to(`user:${otherId}`).emit('call_end', { callId: activeCall.callId });
  try {
    await this.callsService.recordCall({ /* ... */ status: activeCall.status === 'CONNECTED' ? 'COMPLETED' : 'MISSED', /* ... */ });
  } catch {
    // Best-effort history write - never let this crash the process.
  }
}
```

Every database-touching call added in this phase is wrapped in try/catch, deliberately following the exact lesson from the `handleDisconnect` crash bug fixed just before this phase started — new code should not reintroduce the same class of bug.

## How it works — request flow

Tracing a full call from invite to hangup:

1. Alex's client emits `call_invite` with a client-generated `callId`, Mia's user id, `type: 'VIDEO'`, and a WebRTC SDP offer.
2. `handleCallInvite` checks Mia's presence (`PresenceService.isOnline`) and busy state (`CallStateService.isBusy`) — both pass — then calls `CallStateService.startRinging()`, which marks both Alex and Mia busy in the in-memory tracker.
3. It fetches Alex's public profile via `CallsService.getPublicUser` and emits `call_invite` to Mia's `user:<id>` room, carrying the offer and Alex's info.
4. Mia's client answers; emits `call_answer`. `handleCallAnswer` verifies the call is still `RINGING` and she's really the callee, flips it to `CONNECTED` in the tracker, and relays the SDP answer to Alex.
5. Both sides exchange `ice_candidate` events as WebRTC discovers connection paths — pure relay, looked up via `CallStateService.otherParticipant(callId, myUserId)` so neither client needs to know the other's socket id.
6. Alex hangs up: emits `call_end`. `handleCallEnd` removes the call from the tracker, relays `call_end` to Mia, and — since the call had reached `CONNECTED` — calls `CallsService.recordCall` with `status: 'COMPLETED'`, writing the final row to Postgres.

## Verification

No UI exists yet (that's Phase 2/3), so this was verified directly at the signaling layer:

1. **Raw socket.io client test** — three real logged-in users (via actual `/auth/login` + cookie), connected directly with `socket.io-client`, no browser. Exercised: full invite→answer→ICE(both directions)→end; a third caller hitting an already-ringing callee (`call_busy`); reject; timeout. All events arrived exactly where expected.
2. **Direct Postgres query** after the test run confirmed three `Call` rows with the correct `caller`, `callee`, `type`, and `status` (`COMPLETED`, `REJECTED`, `MISSED`) — and confirmed the busy case wrote no row at all, as designed.
3. `npx tsc --noEmit` clean; server restarted cleanly with all 6 new events showing in the NestJS startup log as subscribed.
