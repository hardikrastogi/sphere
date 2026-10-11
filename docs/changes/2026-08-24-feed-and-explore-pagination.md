# Feed & Explore Pagination

## Before

- **Home feed** (`GET /posts`): already paginated, but via a keyset **cursor** (`?cursor=<postId>`). Response shape was `{ items, nextCursor }`. Frontend used `useInfiniteQuery` with the cursor as `pageParam`.
- **Explore** (`GET /posts/explore`): **not paginated at all**. Returned up to 50 posts in a single response, then randomly shuffled them server-side on every request. Frontend fetched them once with a plain `useQuery` and rendered everything immediately — no scroll-triggered loading.
- **`Post` table**: no index on `createdAt`. Any query ordering by `createdAt` (both endpoints did) required Postgres to sort/scan the entire table, which gets slower as the table grows — a real problem at large row counts.
- Migration history was out of sync with the actual database: a duplicate `init` migration existed locally but was never applied, and four tables (`Comment`, `Like`, `Story`, `StoryView`) existed in the live database with no corresponding migration files (likely from an earlier `prisma db push`).

## Requested

1. Posts should load 10 at a time, only fetching the next 10 once the user scrolls to the end — not everything up front.
2. Understand/fix the performance implications of that at very large scale (hundreds of millions of rows).
3. Switch the request/response shape to **limit/offset** style instead of cursor style, matching:
   ```json
   { "posts": [...], "limit": 10, "offset": 0, "total": 100, "hasMore": true }
   ```
   requested via URLs like `GET /posts?limit=10&offset=0`, applied to **both** the home feed and explore.

## Implemented

**Database**
- Added `@@index([createdAt, id])` to the `Post` model (`schema.prisma`) and applied it via a real Prisma migration (`add_post_created_at_index`), so ordering by `createdAt` no longer requires a full table scan.
- Cleaned up the pre-existing migration-history drift (stray unapplied duplicate `init` migration removed; the four untracked tables were reconciled into migration history via `prisma migrate diff` + `prisma migrate resolve --applied`) — no data or schema was changed on the real database, only Prisma's own tracking of what's already there.

```prisma
// schema.prisma — before
model Post {
  id        String      @id @default(cuid())
  ...
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  likes Like[]
  comments Comment[]
}

// schema.prisma — after
model Post {
  id        String      @id @default(cuid())
  ...
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  likes Like[]
  comments Comment[]

  @@index([createdAt, id])
}
```

**Backend** (`posts.service.ts`)

```ts
// before
async getFeed(userId: string, cursor?: string, limit = 10) {
  const cacheKey = !cursor ? `feed:${userId}:first:${limit}` : null;
  if (cacheKey) {
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const posts = await this.prisma.post.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: { media: true, author: { select: { username: true, avatarUrl: true } },
      likes: { where: { userId }, select: { id: true } }, _count: { select: { likes: true } } },
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  const result = { items, nextCursor };
  if (cacheKey) await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', 30);
  return result;
}

async getExploreFeed(userId: string) {
  const posts = await this.prisma.post.findMany({
    where: { authorId: { not: userId } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { media: true, author: { select: { username: true, avatarUrl: true } },
      likes: { where: { userId }, select: { id: true } }, _count: { select: { likes: true } } },
  });
  for (let i = posts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [posts[i], posts[j]] = [posts[j], posts[i]];
  }
  return posts;
}
```

```ts
// after
async getFeed(userId: string, limit = 10, offset = 0) {
  const cacheKey = offset === 0 ? `feed:${userId}:first:${limit}` : null;
  if (cacheKey) {
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const [posts, total] = await Promise.all([
    this.prisma.post.findMany({
      skip: offset,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { media: true, author: { select: { username: true, avatarUrl: true } },
        likes: { where: { userId }, select: { id: true } }, _count: { select: { likes: true } } },
    }),
    this.prisma.post.count(),
  ]);

  const hasMore = offset + posts.length < total;
  const result = { posts, limit, offset, total, hasMore };
  if (cacheKey) await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', 30);
  return result;
}

async getExploreFeed(userId: string, limit = 10, offset = 0) {
  const where = { authorId: { not: userId } };
  const [posts, total] = await Promise.all([
    this.prisma.post.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { media: true, author: { select: { username: true, avatarUrl: true } },
        likes: { where: { userId }, select: { id: true } }, _count: { select: { likes: true } } },
    }),
    this.prisma.post.count({ where }),
  ]);
  const hasMore = offset + posts.length < total;
  return { posts, limit, offset, total, hasMore };
}
```

- Removed the random shuffle from `getExploreFeed` — shuffling on every request is incompatible with offset pagination (the same post could appear on multiple pages, or never appear, since each request re-shuffles independently). Explore is now a deterministic, newest-first, paginated list.

**Backend** (`posts.controller.ts`)

```ts
// before
@Get()
getFeed(@Req() req: any, @Query('cursor') cursor?: string) {
  return this.postsService.getFeed(req.user.userId, cursor);
}
@Get('explore')
getExplore(@Req() req: any) {
  return this.postsService.getExploreFeed(req.user.userId);
}

// after
@Get()
getFeed(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
  return this.postsService.getFeed(
    req.user.userId,
    limit ? parseInt(limit, 10) : undefined,
    offset ? parseInt(offset, 10) : undefined,
  );
}
@Get('explore')
getExplore(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
  return this.postsService.getExploreFeed(
    req.user.userId,
    limit ? parseInt(limit, 10) : undefined,
    offset ? parseInt(offset, 10) : undefined,
  );
}
```

**Frontend** (`home/page.tsx`, same pattern applied to `explore/page.tsx`)

```ts
// before
interface FeedPage { items: Post[]; nextCursor: string | null; }

async function fetchFeedPage({ pageParam }: { pageParam?: string }): Promise<FeedPage> {
  const url = pageParam ? `/posts?cursor=${pageParam}` : '/posts';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

const { data, ... } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: fetchFeedPage,
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
const posts = data?.pages.flatMap((page) => page.items) ?? [];

// after
interface FeedPage { posts: Post[]; limit: number; offset: number; total: number; hasMore: boolean; }
const PAGE_SIZE = 10;

async function fetchFeedPage({ pageParam }: { pageParam: number }): Promise<FeedPage> {
  const res = await apiFetch(`/posts?limit=${PAGE_SIZE}&offset=${pageParam}`);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

const { data, ... } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: fetchFeedPage,
  initialPageParam: 0,
  getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
});
const posts = data?.pages.flatMap((page) => page.posts) ?? [];
```

- Explore page additionally switched from a one-shot `useQuery` (loaded all 50 posts immediately, no scroll trigger) to this same `useInfiniteQuery` + `IntersectionObserver` pattern, and gained a "Loading more..." indicator matching the home feed's existing pattern.

## Why it scales

`LIMIT`/`take` alone doesn't make a query fast — `ORDER BY` runs before `LIMIT` in SQL execution, so without an index, the database still has to sort/scan every row before it can hand back "just the top 10." The `(createdAt, id)` index lets Postgres walk an already-sorted structure and stop as soon as it has enough rows, which is what keeps these queries fast independent of how many total posts exist.

The remaining known trade-off: offset pagination (`skip: N`) still has to walk past `N` rows to reach the offset, so it degrades on *very* deep pagination (e.g. offset in the millions) even with the index — unlike cursor/keyset pagination, which doesn't have that limitation. This was a deliberate choice per your request for the `limit`/`offset`/`total` response shape; worth revisiting if a feed is ever scrolled that deep in practice.
