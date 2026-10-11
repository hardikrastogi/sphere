# Post Interactions and Profile Post Opening

## Requested changes

- Allow a post to be liked by double-clicking its media while retaining the existing like button.
- Keep the animated heart centered over the post media.
- Allow posts in the profile grid, including the signed-in user's posts, to open when clicked.
- Document every project update in a Markdown file going forward.

## Implementation

### Double-click to like

`client/src/components/post-card.tsx`

- Added a double-click handler to the primary post media.
- A double-click likes an unliked post but does not unlike an already-liked post.
- Retained the existing heart button and its like/unlike toggle behavior.
- Added an optimistic heart animation and error toast handling.

Code added:

```tsx
const handleDoubleClick = () => {
  if (!liked) setLikeState(true);
  setShowHeartPop(true);
  setTimeout(() => setShowHeartPop(false), 800);
};
```

This calls the existing like API only when the post is not already liked. It also displays the large heart for 800 milliseconds on every double-click.

`client/src/app/globals.css`

- Added the `heart-pop` scale-and-fade animation.
- Kept positional transforms out of the animation so they cannot interfere with centering.

Code added:

```css
@keyframes heart-pop {
  0% { opacity: 0; transform: scale(0.4); }
  20% { opacity: 1; transform: scale(1.15); }
  35% { transform: scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: scale(1); }
}
```

The heart grows slightly beyond its final size, settles back, and then fades away.

### Centered heart overlay

`client/src/components/post-card.tsx`

- Wrapped the animated heart in an absolute, full-media overlay.
- Used flexbox alignment to center the heart horizontally and vertically for every media size.

Code changed:

```tsx
{showHeartPop && (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <Heart className="h-24 w-24 fill-red-500 text-red-500 drop-shadow-lg animate-[heart-pop_0.8s_ease-out]" />
  </div>
)}
```

`inset-0` makes the overlay cover the entire media area. `items-center` and `justify-center` place the heart at its exact vertical and horizontal center.

### Open posts from profiles

`client/src/app/(main)/profile/[username]/page.tsx`

- Changed profile grid tiles into accessible buttons.
- Added selected-post state and opened the shared `PostModal` when a tile is clicked.
- Reused the existing post card experience, including likes, comments, and double-click liking.

Code added for state and modal rendering:

```tsx
const [openPostId, setOpenPostId] = useState<string | null>(null);

{openPostId && (
  <PostModal postId={openPostId} onClose={() => setOpenPostId(null)} />
)}
```

Code changed for each profile grid tile:

```tsx
<button
  key={post.id}
  type="button"
  onClick={() => setOpenPostId(post.id)}
  aria-label={`Open ${profile.username}'s post`}
  className="relative aspect-square overflow-hidden bg-muted"
>
  {/* Existing photo or video preview */}
</button>
```

Clicking a tile saves its post ID. That ID is passed to `PostModal`, which fetches and displays the full post. Closing the modal resets the ID to `null`.

### Persistent documentation rule

`.cursor/rules/change-documentation.mdc`

- Added an always-applied project rule requiring a Markdown record in `docs/changes/` after every update.
- Updated that rule to require relevant code blocks and plain-language explanations in every change record.

Rule added:

```markdown
- Include the actual code added or modified in fenced code blocks, followed by a plain-language explanation.
- When a complete function or component is too large, show the relevant changed section or a concise before/after diff instead.
```

## Verification

- TypeScript: `tsc --noEmit` passed.
- ESLint passed for the changed React components with no errors.
- Existing `@next/next/no-img-element` optimization warnings remain unchanged.
