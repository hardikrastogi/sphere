# Video Calling Phase 5: Final End-to-End Verification

## Before

Phases 1-4 built and verified the entire calling feature — signaling, WebRTC plumbing, app-wide UI, mute/camera, and edge-case hardening (ring timeout, multi-tab, ICE failure, double-answer guard). Each phase's verification only tested its own slice in isolation. Nothing had verified the feature end-to-end in one continuous session, and nothing had confirmed that calling and the pre-existing chat feature (typing indicators, read receipts, presence) don't interfere with each other when running together on the same socket connection.

## Requested

Implement Phase 5, the final phase of the video-calling roadmap: an end-to-end verification pass.

## Implemented

No code changes - this phase is verification-only. One continuous Playwright session (two real logged-in users, real WebRTC, fake camera/mic via Chromium's fake-device flags) exercised:

1. A plain chat message, before any call - regression baseline.
2. A full video call lifecycle: invite → ring → answer → confirmed live local+remote video tracks → mute → camera-off → un-mute → camera-on → hangup, checked on both sides at each step.
3. A chat message **with a typing indicator, sent while the video call was still connected** - the one path never exercised together before.
4. A second call (audio), declined - confirmed clean reset on both sides.
5. Presence (online dot) re-checked after the whole sequence.
6. Direct query against the `Call` table to confirm the two rows written during this run were exactly correct.
7. A pass over the server's live logs for the whole run, checking for any error/exception.

## How it works — what this phase actually checked

The interesting risk here wasn't any single call operation (those were already proven in Phases 1-4) - it was interference. `ChatGateway` handles both the chat events (`send_message`, `typing`, `stop_typing`) and the call events (`call_invite`, `call_answer`, etc.) on the exact same socket connection and the exact same per-user room (`user:<id>`). If call state had leaked into chat handling, or vice versa, it would only show up when both were exercised in the same session - which is exactly what step 3 did: a typing indicator and a chat message both arrived normally on Alex's side while he was mid-call with Mia.

## Verification results

| Check | Result |
|---|---|
| Pre-call chat message delivered | Pass |
| Video call full lifecycle (invite → connect → mute/camera → hangup) | Pass |
| Live video tracks confirmed on both sides | Pass |
| Chat message + typing indicator delivered **during** an active call | Pass |
| Audio call decline → clean reset both sides | Pass |
| Presence accurate after the full sequence | Pass |
| `Call` table rows match actual outcomes exactly (1 `VIDEO`/`COMPLETED`, 1 `AUDIO`/`REJECTED`, correct caller/callee) | Pass |
| Server logs clean across the whole run | Pass (only a pre-existing, unrelated Postgres SSL-mode notice) |

## Still open

The video/voice calling feature is now fully implemented and verified across all 5 planned phases. One deliberate gap remains, flagged at the end of Phases 3 and 4 and not yet resolved either way: **no REST endpoint exists to read back `Call` history** - rows are written correctly on every resolved call, but nothing lists them (no "recent calls" UI is possible without it). This needs an explicit decision on whether/when to add a `CallsController`, rather than being folded in silently.
