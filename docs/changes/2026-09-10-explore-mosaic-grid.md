# Explore Page: Instagram-Style Mosaic Grid

## Before

The explore feed rendered every post as an equal-size square in a plain 3-column grid (`grid-cols-3`, each cell `aspect-square`) - uniform, no size variation.

## Requested

Vary post sizes like Instagram's explore page - some posts larger, some smaller - and keep the current tile size for the "large" ones while shrinking the rest.

## Implemented

### `client/src/app/(main)/explore/page.tsx`

```tsx
// before
<div className="grid grid-cols-3 gap-1 p-1">
  {posts.map((post) => {
    const media = post.media[0];
    return (
      <div key={post.id} className="relative aspect-square overflow-hidden bg-gray-100">
        ...
      </div>
    );

// after
<div className="grid grid-cols-6 gap-1 p-1">
  {posts.map((post, i) => {
    const media = post.media[0];
    const isLarge = i % 7 === 3;
    return (
      <div
        key={post.id}
        className={`relative aspect-square overflow-hidden bg-gray-100 ${isLarge ? 'col-span-2 row-span-2' : ''}`}
      >
        ...
      </div>
    );
```

The grid moved from 3 columns to 6 - a normal post is now a single small cell (half the width of the old 3-column cells), and a "large" post spans 2×2 of those small cells, landing at exactly the old cell size.

**Why a fixed interval instead of true randomness**: a large tile every 7 posts (starting at index 3) looks varied without risking two large tiles landing adjacent and breaking the grid - the same tradeoff real Instagram makes (their placement isn't truly random either).

**Why this sizing works without extra CSS**: `aspect-square` on the normal (non-spanning) cells defines each grid row's height implicitly (since CSS grid's `auto`-sized rows take their height from the tallest item placed in them). A `row-span-2` large tile spans two such rows, landing at almost exactly double the height - no explicit row-height calculation or padding-trick needed.

## Verification

1. `npx tsc --noEmit` clean.
2. Live Playwright check: confirmed large tiles are perfectly square (`width ≈ height`) and are consistently ~2× the width of a normal tile - i.e., the large tiles render at the old single-cell size, and normal tiles are now genuinely smaller, exactly as requested.
3. Visual screenshot confirms the mosaic pattern renders correctly (blank tiles visible in the screenshot are pre-existing test posts with empty media URLs from earlier testing, unrelated to this change).
