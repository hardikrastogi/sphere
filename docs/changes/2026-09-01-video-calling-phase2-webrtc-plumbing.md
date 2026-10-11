# Video Calling Phase 2: WebRTC Client Plumbing

## Before

Phase 1 (previous session) built the full signaling backend — six socket events relayed through `ChatGateway`, verified with a raw `socket.io-client` script since no browser UI existed yet. Nothing on the client knew how to actually place a call.

## Requested

Implement Phase 2 of the roadmap: the WebRTC client plumbing (`getUserMedia`, `RTCPeerConnection`, ICE exchange, attaching streams to `<video>` elements).

## Implemented

### `client/src/lib/webrtc.ts` (new)

The `ICE_SERVERS` constant from the Phase 0 plan, now actually wired into a real `RTCPeerConnection`.

### `client/src/hooks/useCall.ts` (new) — the actual plumbing

A hook with zero rendering of its own — pure state + WebRTC + signaling wiring, reusable by whatever UI Phase 3 builds:

```ts
export function useCall(otherUserId: string | undefined) {
  // ... returns:
  return { status, callType, incomingCall, localStream, remoteStream, error, startCall, answerCall, rejectCall, endCall };
}
```

`startCall(type)` generates a `callId`, grabs local media, creates the peer connection, creates+sets a local SDP offer, and emits `call_invite`. `answerCall()` mirrors that on the receiving side against the buffered offer, then emits `call_answer`. ICE candidates arriving before the remote description is set are queued (`pendingCandidatesRef`) and flushed once it is — a standard WebRTC race that has to be handled explicitly. Every path (reject/timeout/busy/unavailable/end) funnels through one `cleanup()` that closes the peer connection and stops local media tracks.

### Minimal call UI wired into `client/src/app/(main)/chat/[username]/page.tsx`

Two header buttons (video/voice), disabled when the other person is offline, and a full-screen overlay covering ringing/connected states — built specifically to exercise `useCall`, not as the final experience. **This only works while that exact conversation page is open** — an incoming call from anyone else is invisible right now. Making it reachable app-wide (the same way the chat message toast already works via `bottom-nav.tsx`) is explicitly deferred to Phase 3, not done here.

### Bug found and fixed during verification

```tsx
// before - only re-runs when the stream reference changes
useEffect(() => {
  if (localVideoRef.current) localVideoRef.current.srcObject = call.localStream;
}, [call.localStream]);

// after - also re-runs when status changes, since that's what mounts/unmounts the <video> tag
useEffect(() => {
  if (localVideoRef.current) localVideoRef.current.srcObject = call.localStream;
}, [call.localStream, call.status]);
```

The `<video>` elements only exist in the DOM once `call.status` is `'calling'` or `'connected'`. For the caller, status is already `'calling'` before their stream arrives, so the ref already pointed at a real element — worked by coincidence. For the callee, the stream arrives while still showing the `'ringing'` incoming-call screen (no video tag mounted at all yet); the effect fired against a `null` ref and, since only `call.localStream` was in the dependency array, never re-fired once the tag mounted after answering. Same fix applied to the remote-stream effect for consistency.

## How it works — request flow

1. Alex clicks the video-call button. `startCall('VIDEO')` requests camera+mic (`getUserMedia`), creates an `RTCPeerConnection` with the Phase 0 STUN servers, attaches the local tracks, creates an SDP offer, and emits `call_invite` — landing exactly on the Phase 1 backend, unchanged.
2. Mia's `useCall` instance receives `call_invite` (via the socket that's already open from `getSocket()`), buffers the offer, and flips her local `status` to `'ringing'` — rendering the incoming-call screen.
3. She clicks Answer. `answerCall()` requests her own media, creates her peer connection, sets the buffered offer as the remote description, flushes any ICE candidates that arrived early, creates an SDP answer, and emits `call_answer`.
4. Alex's `call_answer` handler sets that as his remote description; both sides now trade `ice_candidate` events as WebRTC discovers how to reach each other directly.
5. Once connected, `ontrack` fires on both peer connections, populating `remoteStream` — media now flows **peer-to-peer, not through the server at all**. Each side's local preview and the other's video render in the two `<video>` elements.

## Verification

Real WebRTC, not mocked: Chromium launched with `--use-fake-device-for-media-stream` (synthetic animated test pattern for camera, silent tone for mic — no physical hardware needed) across two logged-in browser contexts with camera/mic permissions granted.

- Video call: confirmed Mia's incoming-call screen appeared, confirmed after answering that **both** sides had `videoWidth: 640, videoHeight: 480, tracks: 1` on **both** their local and remote `<video>` elements (this is what surfaced the bug above before the fix — Mia's local preview showed `hasStream: false`), confirmed the frame counter Chrome's fake pattern draws was actually incrementing (live video, not a static frame).
- Hang-up: confirmed Mia's overlay closed when Alex ended the call.
- Voice call + decline: confirmed the incoming screen read "voice call" not "video call", and confirmed Alex's buttons re-enabled after Mia declined.
- `npx tsc --noEmit` clean throughout.
