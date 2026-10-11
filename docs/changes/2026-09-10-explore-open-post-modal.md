# Explore Page: Open a Post, Author Username Clickable

## Before

Explore grid tiles were plain, non-interactive `<div>`s - clicking one did nothing. No way to see who posted it or open it at all.

## Requested

Clicking a post in the explore grid should open it, with the author's username clickable and linking to their Sphere profile.

## Implemented

### Backend: new `GET /posts/:id` (`server/src/posts/`)

```ts
// posts.service.ts
getPostById(userId: string, postId: string) {
  return this.prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: {
      media: true,
      author: { select: { username: true, avatarUrl: true, isVerified: true } },
      likes: { where: { userId }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });
}
```

```ts
// posts.controller.ts - placed last in the file so it can never shadow the more
// specific routes above it (explore, :id/comments, :id/like)
@UseGuards(AuthGuard('jwt'))
@Get(':id')
getPost(@Req() req: any, @Param('id') postId: string) {
  return this.postsService.getPostById(req.user.userId, postId);
}
```

Returns the same raw shape (`likes` array + `_count.likes`) as `getFeed`/`getExploreFeed` already do - the frontend does the `likedByMe`/`likeCount` transformation, matching the existing pattern rather than inventing a new one.

### Frontend: new `client/src/components/post-modal.tsx`

Fetches the post by id and renders it inside a full-screen overlay using the **existing `PostCard`** component unchanged - meaning the clickable/verified-badge-showing username, the like button, and the comment section all come for free, since `PostCard` already has all of that built for the home feed. No UI logic duplicated.

```tsx
export function PostModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { data: post, isLoading } = useQuery({ queryKey: ['posts', postId], queryFn: () => fetchPost(postId) });
  return (
    <div className="fixed inset-0 z-50 ... bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose}><X /></button>
        {isLoading || !post ? <p>Loading...</p> : (
          <PostCard id={post.id} author={post.author} caption={post.caption} media={post.media}
            createdAt={post.createdAt} likedByMe={post.likes.length > 0} likeCount={post._count.likes} />
        )}
      </div>
    </div>
  );
}
```

### `client/src/app/(main)/explore/page.tsx`

- Grid tiles changed from `<div>` to `<button onClick={() => setOpenPostId(post.id)}>` (same visual styling, now interactive).
- Renders `{openPostId && <PostModal postId={openPostId} onClose={() => setOpenPostId(null)} />}`.

## How it works

1. User clicks a tile in the explore grid → `openPostId` is set.
2. `PostModal` fetches `GET /posts/:id` for the full post detail.
3. Renders it via `PostCard` - the same component the home feed uses, so the author's username is already a `<Link href={/profile/${author.username}}>` with the verified badge, exactly like everywhere else in the app.
4. Clicking the username navigates to their profile; clicking the backdrop or the X closes the modal without navigating.

## Verification

1. `npx tsc --noEmit` clean on both projects.
2. Live Playwright run: clicked an explore tile → modal opened with a close button. Found the author's username link (`href="/profile/mia.codes"`), clicked it, confirmed real navigation to that profile page.
3. Confirmed clicking the backdrop closes the modal.
4. Screenshot confirms correct visual layout: header (avatar + clickable username), media, like/comment row, caption, close button.
