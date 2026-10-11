# Message Preview Truncation (Toast + Inbox List)

## Before

- The chat toast (just added) showed the full message text as its description, with no length cap.
- The chat inbox list (`/chat`) relied on a CSS `truncate` class (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) to clip long previews — but as you found, a long message rendered past the edge of the row uncut instead of showing "...". The parent had `min-w-0 flex-1`, which is normally what makes Tailwind's `truncate` work inside a flex row, but it wasn't clipping in practice.

## Requested

1. The toast should show only a short preview — e.g. `"Your own messages don't toast back at you."` → `"Your own messages..."` — so people click "View" to read the rest rather than getting the whole message in the popup.
2. The inbox list preview should truncate the same way, just with a longer limit since that row has more horizontal room.

## Implemented

Rather than lean on CSS truncation again (which is exactly what silently failed before), both places now truncate the **string itself** before it ever reaches the DOM — so there's a hard guarantee on how much text renders, independent of container width, flex quirks, or font size.

**New shared helper** (`client/src/lib/utils.ts`, alongside the existing `cn`):

```ts
/** First line only, cut to maxLength at a word boundary where possible, with a trailing "...". */
export function truncateText(text: string, maxLength: number): string {
  const firstLine = text.split("\n")[0].trim()
  if (firstLine.length <= maxLength) return firstLine
  const truncated = firstLine.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(" ")
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "..."
}
```

It only looks at the first line (a multi-line message won't spill a second line into a one-line preview), and it backs up to the last space before the cutoff so it never chops a word in half — `"Your own messages don't"` sliced blindly at 20 chars would land mid-word; backing up to the last space gives `"Your own messages"` instead.

**`bottom-nav.tsx`** (the toast) — was already truncating with a local, near-identical copy of this same logic from the previous pass; replaced with the shared helper at a 20-character limit:

```ts
// before
description: previewText(message.text),
// (previewText was a local copy of the same logic, now deleted)

// after
description: truncateText(message.text, TOAST_PREVIEW_MAX_LENGTH), // 20
```

**`chat/page.tsx`** (the inbox list) — now truncates to 45 characters, noticeably longer than the toast since the row has much more horizontal space to work with:

```tsx
// before
<p className="truncate text-sm text-gray-500">
  {c.lastMessage ? c.lastMessage.text : 'Say hello!'}
</p>

// after
<p className="truncate text-sm text-gray-500">
  {c.lastMessage ? truncateText(c.lastMessage.text, LIST_PREVIEW_MAX_LENGTH) : 'Say hello!'} {/* 45 */}
</p>
```

The `truncate` CSS class stays as a defense-in-depth backstop (e.g. one genuinely unbroken 45-character word with no spaces at all), but it's no longer what's actually doing the clipping in the normal case — the string is already short by the time it renders.

## How it works — request flow

1. Alex sends a long message to Mia. It's stored and broadcast in full over the socket exactly as before — truncation is a **display-only** concern, nothing about what's saved to the database or sent over the wire changes.
2. On Mia's side, two independent places receive that same full-text message and each apply their own limit at render time: `BottomNav`'s toast handler calls `truncateText(message.text, 20)` for the popup; if she's looking at `/chat`, that page's `useQuery` cache for `GET /chat/conversations` gets invalidated and refetched (existing behavior), and each row calls `truncateText(c.lastMessage.text, 45)` when rendering.
3. Opening the actual conversation (via clicking a row, or the toast's "View" button) still shows the full, untruncated message — truncation only ever applies to these two preview surfaces.

## Verification

Sent a 130-character message and confirmed both surfaces clip correctly: the toast showed `"Your own messages..."` (matching the requested example exactly), and the inbox row showed `"Your own messages don't toast back at..."` — visibly longer than the toast, cut at a word boundary, no more runaway overflow past the row.
