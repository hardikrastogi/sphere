# Blue Tick Verification Phase 4: Badge UI Everywhere

## Before

`isVerified` existed on `User` and rendered in exactly one place — the profile page (Phase 2). Nowhere else a username appears (posts, comments, notifications, chat, search, calls) exposed or rendered it.

## Requested

Implement Phase 4: show the badge everywhere a username is displayed to another user.

## Implemented

### New shared `client/src/components/verified-badge.tsx`

```tsx
import { BadgeCheck } from 'lucide-react';

export function VerifiedBadge({ className = 'h-4 w-4' }: { className?: string }) {
  return <BadgeCheck className={`${className} fill-blue-500 text-white`} />;
}
```

Profile page's Phase 2 inline `<BadgeCheck className="h-4 w-4 fill-blue-500 text-white" />` was refactored to use this instead, now that a second consumer exists.

### Backend: `isVerified` added to every user-facing `select`/`include`

| File | Query |
|---|---|
| `posts.service.ts` | `getFeed`, `getExploreFeed` (`author` select) |
| `posts.service.ts` | `addComment`, `getComments` (`user` select) |
| `notifications.service.ts` | `list` (`actor` select) |
| `follow.service.ts` | `listPendingRequests` (`follower` select) |
| `chat.service.ts` | `resolveUser`, `listConversations` (`user1`/`user2` select) |
| `users.service.ts` | `searchUsers` |
| `calls.service.ts` | `getPublicUser` |

### Frontend: badge wired into 8 components/pages

`post-card.tsx`, `comment-section.tsx`, `notifications/page.tsx`, `profile/requests/page.tsx`, `chat/page.tsx` (conversation list), `chat/[username]/page.tsx` (header), `explore/page.tsx` (search results), `call-overlay.tsx` (incoming + connected screens, via a new `isVerified?: boolean` field on `CallPeer` in `useCall.ts`).

Deliberately skipped: the caption line under a post (`"username caption"`) doesn't repeat the badge already shown in the header above it — avoiding visual noise, the same choice Instagram makes.

## A real bug found and fixed during verification

Two separate `replace_all` edits touched `posts.service.ts`. The first (on the two identical `author: { select: {...} }` fragments in `getFeed`/`getExploreFeed`) worked correctly on both. The second (on the two identical `include: { user: { select: {...} } }` fragments in `addComment`/`getComments`) reported success but **only actually changed `addComment`** — `getComments` silently kept the old select.

This surfaced as a subtle, easy-to-miss symptom: posting a new comment showed the badge immediately (because the POST response came from `addComment`), but reloading the page and re-fetching via `GET /posts/:id/comments` (`getComments`) lost it. Caught by checking the raw API response directly rather than trusting the UI alone - the POST and GET responses for the exact same comment differed in shape, which is what gave it away.

**Lesson for next time**: a `replace_all` success message means the string was found and replaced *somewhere* - it doesn't guarantee every call site you intended actually changed, especially when two unrelated functions happen to share identical boilerplate. Spot-check with a direct API call after this kind of edit.

## Verification

Live pass with `alex_wanders.isVerified` flipped to `true` directly in Postgres, `mia.codes` as the viewer:
1. Profile page - badge visible.
2. Home feed - real post created via API; badge visible on its author line (one false alarm along the way from the pre-existing 30s Redis feed-cache TTL, not a bug - confirmed by retrying after it expired).
3. Comment section - real comment posted; badge count went 1 → 2 (post header + comment) after the `getComments` bug above was fixed.
4. Notifications - real follow request sent; badge visible next to the actor.
5. Follow requests page - same request, badge visible there too.
6. Explore search - badge visible in results.
7. Chat list and chat conversation header - badge visible in both.
8. Call overlay - real call placed; badge visible on the incoming-call screen.
9. `npx tsc --noEmit` clean on both `client` and `server` throughout.

## Still open

Phases 1-2's outbound checkout flow still needs real Razorpay test credentials to verify end-to-end. Phase 5 (edge cases + final verification) not started.
