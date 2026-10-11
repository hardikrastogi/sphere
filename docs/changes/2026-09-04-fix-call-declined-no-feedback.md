# Fix: Declining a call gave the caller no feedback

## Before

When the callee clicked Decline on an incoming call, the caller's overlay just silently closed back to idle — no toast, no indication the other person was ever reached, indistinguishable from a random disconnect.

## Requested

Bug report: after a decline, the caller should see a message reflecting that, but nothing was showing.

## Diagnosed

In `client/src/hooks/useCall.ts`, `call_reject` was wired to the same generic handler as `call_end`:

```ts
const onCallEnded = () => cleanup();
...
socket.on('call_reject', onCallEnded);
```

`cleanup()` resets everything to idle but never sets `error`. `call_busy`/`call_unavailable` each call `setError(...)` before cleaning up (which is why those two already showed a toast) - `call_reject` was the one event that skipped it.

## Implemented

```ts
// before
const onCallEnded = () => cleanup();
...
socket.on('call_reject', onCallEnded);

// after
const onCallEnded = () => cleanup();
const onCallRejected = () => {
  setError('Call declined');
  cleanup();
};
...
socket.on('call_reject', onCallRejected);
```

`call_timeout` and `call_end` stay on the silent `onCallEnded` path - both are normal outcomes (nothing went wrong for the side receiving them), not something requiring an explanatory toast.

## Verification

Live Playwright run: Alex called Mia (video), Mia declined - confirmed Alex's overlay closed and a toast reading exactly "Call declined" appeared. `npx tsc --noEmit` clean.
