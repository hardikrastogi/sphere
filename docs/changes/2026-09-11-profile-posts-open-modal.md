# Profile Page: Posts Open the Same Modal as Explore

## Before

The explore grid opened posts in a modal (via `PostModal`, reusing `PostCard`). The profile page's own post grid (`/profile/[username]`) still used a plain, non-interactive `<div>` per tile - clicking a post on someone's profile did nothing.

## Requested

Clicking a post on the profile page should open it too, the same way explore already does.

## Implemented

### `client/src/app/(main)/profile/[username]/page.tsx`

Reused the exact same `PostModal` component built for explore - no new modal, no new backend endpoint, since `GET /posts/:id` already exists and `PostModal` already handles fetching + rendering via `PostCard`.

```tsx
// added
const [openPostId, setOpenPostId] = useState<string | null>(null);

// grid tile: div -> button
<button
  key={post.id}
  type="button"
  onClick={() => setOpenPostId(post.id)}
  aria-label={`Open ${profile.username}'s post`}
  className="relative aspect-square overflow-hidden bg-muted"
>
  ...
</button>

// rendered once, at the bottom
{openPostId && <PostModal postId={openPostId} onClose={() => setOpenPostId(null)} />}
```

## Verification

Live Playwright run: created a real post, opened the profile page, confirmed the tile is clickable (`aria-label` present), clicked it, confirmed the modal opened with the correct post's caption. `npx tsc --noEmit` clean.
