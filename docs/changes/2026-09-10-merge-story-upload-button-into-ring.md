# Merge Story Upload Button Into the Story Ring

## Before

`GET /stories/active` returns active stories from *everyone*, including the viewer's own — with no exclusion of self. `StoriesBar` didn't account for this: it always rendered a static "Your story" dashed-circle upload button first, then separately mapped over every group in the response including the viewer's own, if they had one. Result: once you posted a story, you appeared twice in the bar — once as the plain upload button, and again as a normal ring further down the list, mixed in among everyone else's stories.

## Requested

Merge these into a single "you" slot: no active story → plain upload button (unchanged). Active story → the ring (clicking views it), with a small "+" badge to add another - never two separate elements for the same person.

## Implemented

### `client/src/components/stories-bar.tsx`

- Added a `fetchMe()` call (`GET /users/me`) to know the current user's id.
- Split the active-stories response into `myGroup` (the viewer's own group, if present) and `otherGroups` (everyone else) - `otherGroups` now excludes self, closing the duplication at the source.
- The "you" slot is now conditional:

```tsx
{myGroup ? (
  <div className="flex flex-col items-center gap-1">
    <div className="relative">
      <button onClick={() => setOpenAuthor({ id: myGroup.author.id, username: myGroup.author.username })}>
        {/* ring + avatar, same treatment as everyone else's story ring */}
      </button>
      <Link href="/create-story" className="absolute bottom-0 right-0 ...">
        <Plus className="h-2.5 w-2.5 text-white" />
      </Link>
    </div>
    <span className="text-[11px]">Your story</span>
  </div>
) : (
  // unchanged: plain dashed-circle upload button
)}
```

The `<button>` (view) and `<Link>` (upload) are siblings inside a `relative` wrapper, not nested inside each other - putting an `<a>` inside a `<button>` is invalid HTML and was avoided rather than papered over with `stopPropagation`.

## How it works

1. `StoriesBar` fetches both the active-stories groups and the current user in parallel.
2. If the current user's id is found among the groups (`myGroup`), that entry is pulled out and rendered as the single "you" slot with the gradient/gray ring (same logic as other users' rings, based on `allSeen`) plus a small black "+" badge overlaid in the corner.
3. Clicking the ring itself opens `StoryViewer` for the current user (same mechanism as clicking anyone else's story). Clicking the small badge navigates to `/create-story` to add another.
4. If the current user has no active story, the original plain upload button renders unchanged.
5. `otherGroups` (everyone except the viewer) renders exactly as before, unaffected.

## Verification

Live Playwright run, logged in as a real user:
1. Before posting a story: exactly one "Your story" label, dashed upload circle present.
2. Created a real story via the API, reloaded the page.
3. After: still exactly one "Your story" label (not duplicated), dashed circle replaced by the ring, exactly one "+" badge overlaid on it.
4. Clicked the ring - confirmed it opened the story viewer and did **not** navigate to `/create-story`.
5. `npx tsc --noEmit` clean.
