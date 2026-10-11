# Open followers/following list on tap

## Request
"when someone clicks on followers or following then the list should be opened of that"

## Before
The Followers/Following counts on the profile page were plain static text - no way to see who they actually were.

## Implemented

### Backend
- `FollowService` gained `listFollowers(viewerId, username)` and `listFollowing(viewerId, username)`, returning `{ id, username, avatarUrl }[]` for every `ACCEPTED` edge, newest first.
- Same privacy rule as viewing someone's posts: a private account's connections are only visible to the account itself or an accepted follower (`assertCanViewConnections`, mirroring the existing `canViewPost`/`canViewPosts` pattern) - `403` otherwise.
- New routes: `GET /users/:username/followers`, `GET /users/:username/following`.

### Frontend
- New `components/follow-list-modal.tsx` - a bottom-sheet modal listing avatar + username, each row linking to that user's profile (closing the modal on click). Shows "This account is private" if the API returns `403`, or an empty-state message if the list is genuinely empty.
- Profile page: the Followers/Following stat blocks are now buttons that open the modal with the right list type.

## Files changed
- `server/src/follow/follow.service.ts`, `server/src/follow/follow.controller.ts`
- `client/src/components/follow-list-modal.tsx` (new)
- `client/src/app/(main)/profile/[username]/page.tsx`

## Verification
Playwright, two real accounts: had mia follow alex (public, auto-accepted), opened alex's Followers list and confirmed mia is listed; opened mia's Following list and confirmed alex is listed. Made alex private and confirmed a non-follower gets `403` on `GET /users/alex_wanders/followers`. `npx tsc --noEmit` clean on both projects. Screenshot confirms the modal matches the current (redesigned) visual style.
