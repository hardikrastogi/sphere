# Chat Bubble Alignment Fix (Wide Screens)

## Before

An earlier fix (`min-w-0` + `break-words` directly on the message bubble) correctly stopped long unbroken text from overflowing its box. But on wide browser windows, received messages still rendered shifted far from the left edge — sometimes appearing centered or pushed toward the right — even though the sender's own messages aligned correctly on the right.

## Requested

Fix the remaining alignment bug: the other person's messages should sit flush left, yours flush right, regardless of message length or screen width.

## Diagnosed root cause

Measured directly in the browser (1920px-wide viewport) rather than guessed:

| Element | Left edge | Width |
|---|---|---|
| Outer row (`justify-start`) | 12px | 1896px (correct — a normal block div, expected to fill its parent) |
| Wrapper (`flex-col items-end`) | 12px | **1896px** ← the bug |
| Bubble (`max-w-[75%]`) | 486px | 1422px (75% exactly — this part *was* working) |

The bubble itself correctly capped at 75% width. But the wrapper div around it (added to stack the read-receipt tick under the bubble) was stretching to fill the *entire* row instead of shrinking to the bubble's size. Since that wrapper has `items-end`, it pushed its content to its own right edge — and because the wrapper was full-width, that shoved the bubble away from the true left edge.

**Why the wrapper stretched:** `max-w-[75%]` was set on the *bubble*, not the wrapper. Percentages need a definite size to resolve against. The wrapper has no explicit width (it's sized by shrink-to-fit), so when the browser tries to compute the wrapper's own size, it needs to know the bubble's preferred width — which depends on 75% of the wrapper's width — which isn't known yet. That circular, indefinite percentage gets treated as unconstrained, and the indefiniteness cascades outward, leaving the wrapper full-width.

## Implemented

Moved the percentage cap up one level, onto the wrapper (whose containing block — the outer row — *is* definite, breaking the circularity), and let the bubble itself size to its own content:

```tsx
// before
<div className="flex min-w-0 flex-col items-end gap-0.5">
  <div className="min-w-0 max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words ...">
    {m.text}
  </div>
  ...
</div>

// after
<div className="flex min-w-0 max-w-[75%] flex-col items-end gap-0.5">
  <div className="w-fit min-w-0 rounded-2xl px-3 py-2 text-sm break-words ...">
    {m.text}
  </div>
  ...
</div>
```

## How it works — request flow

This is a pure rendering fix — no request/response involved. Given a `Message` object already in local state (from history load, `new_message`, or `messages_read`), React renders one row per message:

1. The outer row (`flex justify-start` for received, `justify-end` for your own) is always full-width — that's normal and correct for a block-level flex container.
2. Its one child, the wrapper, now has `max-w-[75%]`. Because the row's width is already definite by the time the wrapper is sized, 75% resolves cleanly — no more circular dependency.
3. Inside that now-correctly-capped wrapper, the bubble uses `w-fit` (shrink-to-content) so a short "hi" renders as a small ~36px pill, while a message long enough to hit the 75% ceiling wraps via `break-words` instead of overflowing.
4. `items-end` on the wrapper still does its job of right-aligning the read-receipt tick under the bubble — but now it's aligning within a properly-sized box, so it no longer visibly displaces anything.

## Verification

Measured actual computed styles and bounding boxes via a script (not just eyeballing screenshots) at a 1920px viewport:
- A long, unbroken repeated-text message: wrapper and bubble both now sit at `x: 12` (flush left) with `width: 1422` (exactly 75% of the 1896px row).
- A short "hi" message: wrapper and bubble both sit at `x: 12` with `width: 36` — confirming short messages still shrink down and aren't forced to render at the full 75% cap.
- Screenshot at the same width confirms every message in a real conversation (mix of short and very long) renders flush left, with the sender's own messages correctly flush right in black.
