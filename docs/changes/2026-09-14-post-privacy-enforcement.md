# Enforce account privacy on posts (feed, explore, direct view, likes, comments)

## Request
Follow-up to the settings/privacy feature: "as the project is almost complete is there any thing left to fix or implement?" surfaced that the `isPrivate` flag added for the settings page only gated the profile page — it was never checked anywhere posts themselves are served. User said "fix it."

## Before
`isPrivate` (added in the settings-page change) only affected `UsersService.getProfile` / `getUserPosts` and `FollowService.sendRequest`. Everywhere else in `posts.service.ts` had no privacy check at all:
- `getFeed` (home feed) and `getExploreFeed` returned posts from every author, private or not.
- `getPostById` had no check — any post was viewable directly by ID regardless of follow status.
- `likePost` / `addComment` created the like/comment before any visibility check.
- `GET /posts/:id/comments` didn't even require authentication (`@UseGuards(AuthGuard('jwt'))` was missing).

So marking your account private stopped strangers from seeing your profile grid, but their posts still leaked into everyone's home/explore feed and could still be opened, liked, or commented on directly.

## Implemented
- `PostsService` gained a shared `canViewPost(viewerId, authorId, authorIsPrivate)` check: visible if you're the author, the author is public, or you're an `ACCEPTED` follower — and `getAcceptedFollowingIds(userId)` to build the "who am I an accepted follower of" set once per feed request.
- `getFeed` / `getExploreFeed`: `where` clause now excludes posts from private authors unless you're the author or an accepted follower (`OR: [{ authorId: userId }, { author: { isPrivate: false } }, { authorId: { in: followingIds } }]`).
- `getPostById`, `likePost`, `addComment`, `getComments`: all now check `canViewPost` first and throw `ForbiddenException` ("This account is private") if it fails, before doing anything else.
- `GET /posts/:id/comments` now requires auth (`AuthGuard('jwt')`) like every other posts route, and `getComments` takes the viewer's `userId` to run the same check.

## Files changed
- `server/src/posts/posts.service.ts`
- `server/src/posts/posts.controller.ts`

## Verification
Playwright, two real accounts (alex, mia): created a real post as alex, made alex private, then confirmed as mia (not yet a follower): post excluded from home feed and explore, direct `GET /posts/:id` → 403, `GET /posts/:id/comments` → 403, `POST /posts/:id/like` → 403. Had alex accept mia as a follower, confirmed direct view and comments now return 200. Separately confirmed the home feed itself picks up the change too, once its existing 30s Redis cache (pre-existing, unrelated to this fix) expires — a fresh post-cache-expiry check showed the post correctly appearing in mia's feed. `npx tsc --noEmit` clean. Test post and follow edge cleaned up after the run.
