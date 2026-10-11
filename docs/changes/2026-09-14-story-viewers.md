# Story viewers list

## Request
"in story if i upload a story how can i see who has seen it?"

Follow-up: "also add a timer bar just like instagram when i open a story there should be a bar that flows left to rigt as a timer"

## Before
`StoryView` rows were already created (`POST /stories/:id/view`, called whenever someone opens a story) and used to compute the "seen" ring color on the stories bar, but there was no way to see *who* had viewed a story — no endpoint, no UI.

## Implemented
- **Backend**: new `GET /stories/:id/views` endpoint. Only the story's author can call it (403 for anyone else, 404 if the story doesn't exist). Returns each viewer's `username`, `avatarUrl`, `isVerified`, and `viewedAt`, newest first. The author's own view (registered when they open their own story to check it) is excluded from the list, matching how every real stories feature behaves — you never see yourself in your own viewer list.
- **Frontend**: `StoryViewer` gained a "Viewers" button (bottom-left, eye icon), shown only when `isOwnStory` is true. Tapping it opens a bottom-sheet panel listing viewers with avatar + username + verified badge, or "No views yet." while empty. Auto-advance to the next story pauses while the panel is open. The next/prev tap zones are disabled while the panel is open so it doesn't feel like it's fighting the story navigation.

Also added an Instagram-style progress bar: the segment for the currently showing story now animates from empty to full over the same 5s the auto-advance timer uses (a CSS `@keyframes` animation, not a JS-driven width — no jank, no extra renders). It's `key`ed on `index` so it restarts cleanly each time the story changes, and it pauses (`animationPlayState: paused`) whenever the viewers panel is open, matching the auto-advance timer's own pause behavior. Segments before the current one are fully filled; segments after are empty, same as before.

## Files changed
- `server/src/stories/stories.service.ts` — added `getViewers(userId, storyId)`.
- `server/src/stories/stories.controller.ts` — added `GET :id/views` route.
- `client/src/components/story-viewer.tsx` — added viewers panel, `isOwnStory` prop, gated the auto-advance effect; added the animated per-segment progress bar.
- `client/src/components/stories-bar.tsx` — passes `isOwnStory={openAuthor.id === me?.id}` into `StoryViewer`.
- `client/src/app/globals.css` — added `@keyframes story-progress` (0% → 100% width, linear).

## Request flow
1. Author opens their own story from the stories bar (`isOwnStory` computed by comparing the group's author id to `/users/me`).
2. Tapping "Viewers" sets `showViewers = true`, which enables a React Query fetch of `GET /stories/:id/views` (only fires for the current story, only while the panel is open).
3. Backend confirms the requester owns the story, then returns `StoryView` rows for that story excluding the owner's own row.
4. Panel renders the list; closing it (X button) resumes normal story auto-advance.

## Verification
Playwright, two real accounts (alex, mia): created a real story via the API, had Mia view it, confirmed a non-author (`403`) can't fetch viewers, confirmed Alex's own-story view shows the "Viewers" button, opened it, and confirmed Mia is listed while Alex (self) is not. `npx tsc --noEmit` clean on both client and server. Test story/storyView data cleaned up after the run.

Progress bar: opened a real story and measured the current segment's rendered width at 0s/2s/4s (5px → 90px → 177px, monotonically increasing), then screenshotted mid-animation to confirm it visually fills left to right. `npx tsc --noEmit` clean.
