# Notifications

## Before

- No `Notification` model, no notifications module, no `/notifications` page — confirmed empty in the earlier survey before starting Profile.
- `Follow`, `Like`, and `Comment` actions happened silently — nothing recorded that they occurred, beyond the rows themselves.
- Bottom nav had Home/Explore/Create/Profile — no Notifications tab.

## Requested

Build the Notifications feature, following on from the Profile/Follow system: notify a user when someone requests to follow them, when a follow request is accepted, and when someone likes or comments on their post.

## Implemented

### Data model (`server/prisma/schema.prisma`)

New `Notification` model + `NotificationType` enum, migrated via `add_notification_model`:

```prisma
enum NotificationType {
  FOLLOW_REQUEST
  FOLLOW_ACCEPTED
  LIKE
  COMMENT
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  recipient   User             @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actorId     String
  actor       User             @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  type        NotificationType
  postId      String?
  post        Post?            @relation(fields: [postId], references: [id], onDelete: Cascade)
  read        Boolean          @default(false)
  createdAt   DateTime         @default(now())

  @@index([recipientId, createdAt, id])
  @@index([recipientId, read])
}
```

`postId` is nullable since `FOLLOW_REQUEST`/`FOLLOW_ACCEPTED` notifications aren't about a post.

### Backend: new `notifications` module (read side)

`GET /notifications?limit=&offset=` (same `{ items..., limit, offset, total, hasMore }` pagination shape used everywhere else in the app), `GET /notifications/unread-count`, `POST /notifications/read-all`. Straightforward — no write-side logic here, that lives where the actual events happen (see below).

### Backend: triggers wired into existing services

Rather than introducing a cross-module dependency (`PostsService`/`FollowService` calling into a `NotificationsService`), notifications are created with a plain `this.prisma.notification.create(...)` at the point of the event — `PrismaService` is already global, so this needed no new wiring and matches how the rest of the app already touches Prisma directly rather than composing services.

**`follow.service.ts`** — `sendRequest` now also creates a `FOLLOW_REQUEST` notification (skipped if a request already exists, so re-clicking doesn't spam); `removeFollow` (unfollow/cancel) deletes any leftover `FOLLOW_REQUEST` notification for the target so a canceled request doesn't leave a stale, un-actionable entry in their inbox.

Accept/reject were refactored to share one core mutation (`applyAccept`/`applyReject`), because a second entry point was needed — see below:

```ts
private async applyAccept(request: { id: string; followerId: string; followingId: string }) {
  const updated = await this.prisma.follow.update({ where: { id: request.id }, data: { status: 'ACCEPTED' } });
  await this.prisma.notification.deleteMany({
    where: { recipientId: request.followingId, actorId: request.followerId, type: 'FOLLOW_REQUEST' },
  }); // the original request notification is now resolved, remove it
  await this.prisma.notification.create({
    data: { recipientId: request.followerId, actorId: request.followingId, type: 'FOLLOW_ACCEPTED' },
  });
  return updated;
}
```

Rejecting stays silent (no notification to the rejected user) — matches how most apps handle this, to avoid an awkward "you got rejected" push.

**`posts.service.ts`** — `likePost` and `addComment` now look up the post's `authorId` and create a `LIKE`/`COMMENT` notification, skipped when you like/comment on your own post. `likePost` changed from an `upsert` to an explicit find-then-create specifically so a repeated like click (already liked) doesn't fire a duplicate notification.

### New API surface for accepting/rejecting (bug found during my own verification)

The notifications list only has the *actor's username* (`alex_wanders`), not the underlying `Follow` row's id — and the existing accept/reject endpoints (`POST /follow-requests/:id/accept`) need that id, which was built for the `/profile/requests` inbox where the id is already in hand from `GET /follow-requests`. Rather than adding a column to `Notification` just to carry that id around, I added a second pair of endpoints keyed by username, symmetric with the existing `/users/:username/follow`:

```ts
@Post('users/:username/follow/accept')
acceptFrom(@Req() req, @Param('username') username: string) {
  return this.followService.acceptRequestFrom(req.user.userId, username);
}
@Post('users/:username/follow/reject')
rejectFrom(@Req() req, @Param('username') username: string) { ... }
```

Both `/profile/requests` (id-based) and the notifications page (username-based) now share the same `applyAccept`/`applyReject` core, so there's exactly one place the "what happens when a request is accepted" logic lives.

### Frontend

- **`(main)/notifications/page.tsx`** (new) — paginated list (same `useInfiniteQuery` + `IntersectionObserver` pattern as Home/Explore/Profile), one line per notification with a human-readable message per type (`"{username} requested to follow you"`, `"liked your post"`, etc.), a post thumbnail when there's an associated post, and inline Accept/Reject buttons directly on `FOLLOW_REQUEST` rows. Fires `POST /notifications/read-all` on mount and invalidates the `['notifications']` query cache so the unread highlight clears without needing a page reload.
- **`bottom-nav.tsx`** — added a `Bell` tab, with a small unread-count badge (`GET /notifications/unread-count`, polled every 30s via React Query's `refetchInterval` — there's no WebSocket/push infrastructure in this app, so this is a plain poll, not instant. A badge can lag up to 30s behind an event happening in another session; it updates immediately on a fresh page load/navigation to a not-yet-mounted layout).

## Verification

Full Playwright run across two logged-in browser contexts: Mia creates a real test post (throwaway 1x1 PNG, uploaded through the actual Cloudinary flow) → Alex sends a follow request → Mia's badge shows "1" and her `/notifications` page shows "alex_wanders requested to follow you" with working inline Accept → after accepting, Alex's unread count becomes 1 (confirmed via direct API call — `GET /notifications` correctly returns the `FOLLOW_ACCEPTED` row; the *visible* badge only updates on the existing 30s poll or next navigation, since `BottomNav` stays mounted across client-side route changes and doesn't refetch immediately on an event happening on someone else's screen — expected, not a bug) → Alex likes and comments on Mia's post → Mia's `/notifications` shows both, each with the post thumbnail, correctly marked unread until she opens the page.

Also hit the same "stale running server" snag as the Profile pass (process wasn't in `--watch` mode) — restarting via `npm run start:dev` resolved it; not a bug in this feature's code.
