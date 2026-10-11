# User Profiles & Approval-Based Following

## Before

- No `Notification` or `Follow` model existed in the schema at all — no concept of following anyone.
- `users` module only had `GET /users/me` and `PATCH /users/me`. No "get profile by username" or "list a user's posts" endpoint.
- No `/profile` pages existed on the client (not even stubs), though `middleware.ts` already reserved `/profile` as a protected route.
- Bottom nav had Home/Explore/Create only (Profile deliberately left out per the previous change's note, until the page existed).

## Requested

Build the Profile feature first (before Notifications), with **approval-based following** — like a private Instagram account: sending a follow request doesn't grant access until the target explicitly accepts it.

## Implemented

### Data model (`server/prisma/schema.prisma`)

New `Follow` model + `FollowStatus` enum, migrated via `add_follow_model`:

```prisma
enum FollowStatus {
  PENDING
  ACCEPTED
}

model Follow {
  id          String       @id @default(cuid())
  followerId  String
  followingId String
  status      FollowStatus @default(PENDING)
  createdAt   DateTime     @default(now())

  follower  User @relation("UserFollowing", fields: [followerId], references: [id], onDelete: Cascade)
  following User @relation("UserFollowers", fields: [followingId], references: [id], onDelete: Cascade)

  @@unique([followerId, followingId])
  @@index([followingId, status])
  @@index([followerId, status])
}
```

A row's existence + `status` encodes the whole relationship: no row = not following, `PENDING` = requested, `ACCEPTED` = following. Unfollowing/rejecting just deletes the row rather than tracking a third "rejected" state — kept deliberately minimal.

**Design consequence, not separately requested but load-bearing:** since every account requires approval (no public/private toggle — you chose the private-account model globally), a user's **posts are only visible to accepted followers or themselves**. `GET /users/:username` returns a `canViewPosts` flag, and `GET /users/:username/posts` enforces it server-side (403 if you try to fetch anyway) — not just hidden in the UI.

### Backend: extended `users` module (`server/src/users/users.service.ts`, `users.controller.ts`)

New read endpoints, appended *after* the existing `me`/`search` routes (Express matches routes in registration order — `:username` must come after the static routes or it would swallow `/users/me` and `/users/search`):

```ts
// users.service.ts (new methods)
async getProfile(viewerId: string, username: string) {
  const user = await this.prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, bio: true, avatarUrl: true, createdAt: true },
  });
  if (!user) throw new NotFoundException('User not found');

  const isSelf = user.id === viewerId;
  const [followersCount, followingCount, postsCount, edge] = await Promise.all([
    this.prisma.follow.count({ where: { followingId: user.id, status: 'ACCEPTED' } }),
    this.prisma.follow.count({ where: { followerId: user.id, status: 'ACCEPTED' } }),
    this.prisma.post.count({ where: { authorId: user.id } }),
    isSelf ? null : this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    }),
  ]);

  const relationship = isSelf ? 'SELF' : (edge?.status ?? 'NOT_FOLLOWING');
  const canViewPosts = isSelf || relationship === 'ACCEPTED';
  return { ...user, followersCount, followingCount, postsCount, isSelf, relationship, canViewPosts };
}

async getUserPosts(viewerId: string, username: string, limit = 12, offset = 0) {
  const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new NotFoundException('User not found');
  if (user.id !== viewerId) {
    const edge = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
    });
    if (edge?.status !== 'ACCEPTED') throw new ForbiddenException('This account is private');
  }
  // ... same skip/take/count pagination shape as the home feed and explore
}
```

Routes: `GET /users/:username` (profile + counts + relationship), `GET /users/:username/posts?limit=&offset=` (same `{ posts, limit, offset, total, hasMore }` shape used by the feed/explore endpoints, for consistency).

### Backend: new `follow` module (`server/src/follow/`, new files)

`follow.service.ts` — `sendRequest` (creates a `PENDING` row, idempotent if one already exists, blocks following yourself), `removeFollow` (deletes the row — covers both "unfollow" and "cancel my pending request"), `listPendingRequests` (requests addressed to me), `acceptRequest`/`rejectRequest` (verify the request actually targets me before mutating).

`follow.controller.ts`:

```ts
@UseGuards(AuthGuard('jwt'))
@Controller()
export class FollowController {
  @Post('users/:username/follow') follow(...) { ... }
  @Delete('users/:username/follow') unfollow(...) { ... }
  @Get('follow-requests') listRequests(...) { ... }
  @Post('follow-requests/:id/accept') accept(...) { ... }
  @Post('follow-requests/:id/reject') reject(...) { ... }
}
```

Registered as `FollowModule` in `app.module.ts`. `PrismaService` is `@Global()` so no extra wiring was needed.

### Frontend: new pages (`client/src/app/(main)/profile/`)

- **`page.tsx`** — thin redirect: fetches `/users/me`, then `router.replace('/profile/' + username)`. (Not read from Redux — the store only ever gets populated on login/signup, with no rehydration on page refresh, so it would be `null` after a hard reload even with a valid session cookie.)
- **`[username]/page.tsx`** — the actual profile: avatar, post/follower/following counts, bio, and a context-dependent action area — `Edit Profile` + `Requests` buttons for your own profile, or a `Follow` / `Requested` / `Following` button (driven by the `relationship` field) for anyone else. Below that, either the post grid (same `useInfiniteQuery` + `IntersectionObserver` pattern as Explore) or a lock-icon "This account is private" message, gated on `canViewPosts`.
- **`edit/page.tsx`** — edit username/bio/avatar, reusing the existing `uploadToCloudinary` helper (same one `create/page.tsx` uses) for avatar upload, `PATCH /users/me` to save.
- **`requests/page.tsx`** — lists pending incoming requests via `GET /follow-requests`, with Accept/Reject buttons.

### Small integration changes

- `bottom-nav.tsx`: added the `Profile` tab (`User` icon → `/profile`) — previously left out on purpose until the page existed.
- `post-card.tsx`: the author avatar/username in each post header is now a `Link` to `/profile/{username}` (it was static before).

## Verification

Ran both dev servers, logged into two separate browser contexts (seeded users `alex_wanders` and `mia.codes`), and drove the full loop with Playwright: Alex sends a follow request to Mia → Mia's profile shows "This account is private" and Alex's button shows "Requested" → the request appears in Mia's `/profile/requests` inbox → Mia accepts → Mia's follower count updates to 1 and Alex's button flips to "Following" with the post grid now unlocked. Also hit an unrelated snag: the already-running server process was stale (not in watch mode), producing a 500 on the new endpoint — restarting via `npm run start:dev` fixed it; not a bug in the new code.

## Not built yet (deliberately out of scope for this pass)

- Followers/following **list** pages (currently just counts, not browsable) — flagged during planning as an easy follow-up.
- Notifications (e.g. "X requested to follow you") — next up per your plan; the `Follow` model this pass introduces is exactly what a "follow request" notification would key off of.
