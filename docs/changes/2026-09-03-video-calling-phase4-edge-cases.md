# Video Calling Phase 4: Edge Cases

## Before

Phases 1-3 built the full signaling backend, WebRTC client plumbing, and an app-wide call UI with mute/camera. But an audit against realistic failure/multi-device scenarios (per the standing phase-by-phase workflow, before advancing to Phase 5) found four real gaps:

- Nothing ever emitted the `call_timeout` event the server already knew how to handle — an ignored call rang forever.
- A user with two open tabs would have both ring on an incoming call, but answering/declining on one left the other stuck ringing.
- No handling for a mid-call ICE connection failure (dropped network with no TURN relay to fall back on).
- Rapidly double-clicking Answer could start two peer connections off the same offer, leaking the first camera stream.

## Requested

Implement Phase 4 of the video-calling roadmap: the remaining edge cases.

## Implemented

### 1. No-answer timeout (`client/src/hooks/useCall.ts`)

```ts
// before: no timer at all - call_invite sent, then nothing further happens client-side
getSocket().emit('call_invite', { callId, calleeId: callee.id, type, offer });

// after
getSocket().emit('call_invite', { callId, calleeId: callee.id, type, offer });
ringTimeoutRef.current = setTimeout(() => {
  getSocket().emit('call_timeout', { callId });
  setError('No answer');
  cleanup();
}, RING_TIMEOUT_MS); // 45s
```

Cleared in `cleanup()` (covers busy/unavailable/manual-hangup-while-calling) and explicitly in the `call_answer` handler, since a successful connect doesn't go through `cleanup()`.

### 2. Multi-tab ring-stop (`server/src/chat/chat.gateway.ts` + `useCall.ts`)

```ts
// handleCallAnswer, after connecting the call - before, only the caller's room was told
this.server.to(`user:${call.callerId}`).emit('call_answer', { callId: body.callId, answer: body.answer });
this.server.to(`user:${call.calleeId}`).emit('call_ring_stop', { callId: body.callId }); // new

// handleCallReject, symmetric addition
this.server.to(`user:${call.callerId}`).emit('call_reject', { callId: body.callId });
this.server.to(`user:${call.calleeId}`).emit('call_ring_stop', { callId: body.callId }); // new
```

Client side, a new listener silently closes a still-ringing tab that lost the race:

```ts
const onCallRingStop = (payload: { callId: string }) => {
  if (payload.callId === callIdRef.current && status === 'ringing') cleanup();
};
```

No error is shown on this path deliberately — nothing went wrong for that tab, the call was just handled elsewhere.

### 3. Mid-call ICE failure (`useCall.ts`, inside `createPeerConnection`)

```ts
pc.oniceconnectionstatechange = () => {
  // 'disconnected' can recover on its own; only 'failed' means it's truly dead
  // (no TURN relay configured, per the Phase 0 decision - no path to recover it).
  if (pc.iceConnectionState === 'failed') {
    getSocket().emit('call_end', { callId });
    setError('Connection lost');
    cleanup();
  }
};
```

### 4. Double-answer race guard (`useCall.ts`, `answerCall`)

```ts
// before
const answerCall = useCallback(async () => {
  if (!incomingCall || !pendingOfferRef.current) return;
  const { callId, type, caller } = incomingCall;
  // ...later: await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));

// after
const answerCall = useCallback(async () => {
  if (!incomingCall || !pendingOfferRef.current) return;
  const { callId, type, caller } = incomingCall;
  const offer = pendingOfferRef.current;
  pendingOfferRef.current = null; // consumed synchronously - a second rapid click now sees null and bails
  // ...later: await pc.setRemoteDescription(new RTCSessionDescription(offer));
```

### Also: friendlier `getUserMedia` error messages

```ts
function mediaErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Camera/microphone access was denied';
    if (err.name === 'NotFoundError') return 'No camera or microphone found';
  }
  return err instanceof Error ? err.message : 'Failed to access camera/microphone';
}
```

Used in both `startCall` and `answerCall`'s catch blocks, replacing the raw `err.message`.

## Full event/handler map (updated)

| Event | Direction | Handler | Purpose |
|---|---|---|---|
| `call_invite` | caller → server → callee | `ChatGateway.handleCallInvite` | Starts a call; pre-checks online/busy, carries the SDP offer |
| `call_answer` | callee → server → caller | `ChatGateway.handleCallAnswer` | Relays the SDP answer; **now also emits `call_ring_stop` to the callee's own room** |
| `ice_candidate` | both → server → other | `ChatGateway.handleIceCandidate` | Relays ICE candidates as discovered |
| `call_reject` | callee → server → caller | `ChatGateway.handleCallReject` | Declines before answering; writes `REJECTED`; **now also emits `call_ring_stop`** |
| `call_timeout` | caller → server → callee | `ChatGateway.handleCallTimeout` | **Now actually triggered client-side** by the new 45s ring timer; writes `MISSED` |
| `call_end` | either → server → other | `ChatGateway.handleCallEnd` | Manual hangup, **or the new ICE-failure auto-trigger**; writes `COMPLETED`/`MISSED` |
| `call_busy` / `call_unavailable` | server → caller | inline in `handleCallInvite` | Pre-checks; no `Call` row |
| `call_ring_stop` | server → callee's own room | inline in `handleCallAnswer`/`handleCallReject` | **New.** Closes ringing UI on the callee's other tabs/devices, silently |
| disconnect mid-call | — | `ChatGateway.handleDisconnect` | Unchanged from Phase 1 - resolves any in-progress call on socket drop |

## How it works — request flow (multi-tab case)

1. Mia has the app open in two tabs. Alex calls her; both tabs' `useCall` instances receive `call_invite` (same room, `user:<miaId>`, joined by every socket she has open) and both flip to `'ringing'`.
2. She clicks Answer on Tab A. `handleCallAnswer` on the server validates the call is still `RINGING`, flips it to `CONNECTED`, emits `call_answer` to Alex's room (completes his side of the handshake) **and** emits the new `call_ring_stop` to Mia's own room.
3. Tab A's `useCall` ignores `call_ring_stop` (its `incomingCall` is already `null` by then — no-op). Tab B, still `'ringing'` with a matching `callId`, calls `cleanup()` — its overlay disappears with no error toast.

## Verification

Real WebRTC + real signaling, fake camera/mic via Chromium's fake-device flags, plus targeted stubbing where those same flags made a genuine negative case unreachable:
1. Ring timeout temporarily shortened to 5s for the test run (reverted after) - confirmed both sides auto-closed and the caller saw "No answer".
2. Two tabs logged in as the same user, both rang; answered on Tab A; confirmed Tab B closed silently (no toast) while Tab A connected.
3. `--use-fake-ui-for-media-stream` auto-grants every permission prompt, so real denial can't be triggered through Playwright's `permissions` context option - verified instead by stubbing `getUserMedia` via `page.addInitScript` to reject with a real `NotAllowedError`. Confirmed the friendly toast text and that both sides cleaned up correctly.
4. Double-clicked Answer rapidly; inspected every `<video>` element's `srcObject` stream id directly - exactly one local and one remote stream existed, no orphaned duplicate.
5. `npx tsc --noEmit` clean on both `client` and `server`.

## Still open (flagged, not part of this phase)

No REST endpoint to read back `Call` history - unchanged from Phase 3, still not addressed. Phase 5 (final end-to-end verification pass across the whole feature) is next on the roadmap.
