# Video Calling Phase 3: App-Wide Call UI + Mute/Camera

## Before

Phase 2 built the full WebRTC engine (`useCall`) and wired a minimal call UI directly into `/chat/[username]/page.tsx` — but the hook took a fixed `otherUserId` at mount time and only ever ran while that one conversation page was open. An incoming call from anyone else, while you were on `/home` or any other page, was completely invisible. No mute, no camera toggle.

## Requested

Implement Phase 3: a call UI reachable from anywhere in the app, plus in-call mute/camera controls.

## Implemented

### `useCall.ts` refactored to be instantiable exactly once, globally

```ts
// before
export function useCall(otherUserId: string | undefined) {
  const startCall = useCallback(async (type: CallType) => {
    // ... emits call_invite with the fixed otherUserId
  }, [otherUserId, ...]);
}

// after
export function useCall() {
  const startCall = useCallback(async (callee: CallPeer, type: CallType) => {
    // callee is passed per-call, not fixed at mount
    setPeer(callee);
    // ... emits call_invite with callee.id
  }, [...]);
}
```

Also added `peer` (who the current call is with — needed once the UI isn't pinned to one conversation's already-known `otherUser`), and `isMuted`/`isCameraOff` + `toggleMute()`/`toggleCamera()`:

```ts
const toggleMute = useCallback(() => {
  setIsMuted((prev) => {
    const next = !prev;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    return next;
  });
}, [localStream]);
```

Flipping `track.enabled` (not removing/stopping the track) is the standard approach — the remote side keeps receiving silence or a black frame instead of the track dropping, which would otherwise require renegotiating the connection.

### New `client/src/contexts/call-context.tsx`

`CallProvider` calls `useCall()` exactly once; `useCallContext()` is how any component reads or drives the single shared call state.

### New `client/src/components/call-overlay.tsx`

The ringing/connected UI, moved out of the chat page (which now only keeps its two header buttons), plus the mute and camera-toggle buttons, plus the `call.error` toast effect that used to live on the chat page.

### `(main)/layout.tsx` — the actual fix for reachability

```tsx
// before
<div className="flex min-h-full flex-1 flex-col pb-14">
  {children}
  <BottomNav />
</div>

// after
<CallProvider>
  <div className="flex min-h-full flex-1 flex-col pb-14">
    {children}
    <BottomNav />
  </div>
  <CallOverlay />
</CallProvider>
```

Mounting `CallOverlay` at the layout level — outside `{children}`, alongside `BottomNav` — means it renders on top of *whatever page happens to be open* the instant a `call_invite` arrives, rather than only existing inside one specific page's component tree. Exactly the same architectural move already used for the chat message toast in `bottom-nav.tsx`.

### `chat/[username]/page.tsx` simplified

Swapped its local `useCall(conversation?.otherUser.id)` for `useCallContext()`, removed the ~60 lines of overlay JSX and the two video-ref-attachment effects (now living once in `CallOverlay` instead of being duplicated per page), and updated the header buttons to `call.startCall(conversation.otherUser, type)`.

## How it works — request flow

1. Alex is on `/chat/mia.codes`, clicks the video button. `call.startCall(conversation.otherUser, 'VIDEO')` runs on the *shared* `useCall` instance from `CallProvider` — mechanically identical to Phase 2 from here (getUserMedia → peer connection → offer → `call_invite`).
2. Mia is on `/home`. Her browser's single `getSocket()` connection (already open since `BottomNav` mounted) receives `call_invite` regardless of what page she's looking at, because the listener lives inside `useCall`, which lives inside `CallProvider`, which wraps the *entire* `(main)` layout — not inside any specific page.
3. Her `status` flips to `'ringing'`. `CallOverlay`, mounted as a sibling of `{children}` at the layout level, sees that status change and renders the full-screen incoming-call UI *on top of* whatever `/home` was showing — she never navigated anywhere.
4. She clicks Answer; the rest (answer → ICE → connected) is identical to Phase 2.
5. Once connected, clicking the mute button calls `call.toggleMute()`, which disables the local audio track directly — no socket round-trip needed, since muting is purely local to the sender.

## Verification

Two logged-in sessions, fake camera/mic, Chromium's fake-device flags:
1. Mia stayed on `/home` the entire time — confirmed her URL never changed — while Alex called her; confirmed the incoming-call screen rendered anyway.
2. Confirmed the local audio track's `.enabled` flipped `true → false` after clicking Mute.
3. Confirmed the local video track's `.enabled` flipped `true → false` after clicking camera-off, and confirmed it visually (the local preview tile goes solid black).
4. Confirmed hang-up still closes the overlay on the other side.
5. `npx tsc --noEmit` clean.

## Still open (flagged, not part of this phase)

No REST endpoint exists to read back `Call` history — rows are written on every resolved call but nothing lists them yet. Not part of the original Phase 3 scope; would need its own `CallsController` addition before a "recent calls" list could be built.
