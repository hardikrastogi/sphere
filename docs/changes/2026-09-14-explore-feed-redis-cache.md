# Redis caching for the explore feed (+ own-feed cache invalidation on new post)

## Request
"also i want redis to also use for explore page, home page"

## Before
The home feed (`getFeed`) already cached its first page in Redis for 30s (`feed:<userId>:first:<limit>`). The explore feed (`getExploreFeed`) had no caching at all — every load hit Postgres directly. Also, the home feed cache had no invalidation: if you posted something new, your own feed wouldn't show it until the 30s TTL expired.

## Implemented
- Factored the existing cache-read/compute/cache-write logic out of `getFeed` into a shared `withFirstPageCache(cacheKey, compute)` helper.
- `getExploreFeed` now uses the same pattern: first page (`offset === 0`) is cached under `explore:<userId>:first:<limit>` for 30s, same TTL as the home feed. Later pages (infinite-scroll pagination) are never cached, same as before — only the page every fresh load/refresh actually hits is worth the cache.
- Cache keys are per-user (not shared), which matters now that feeds are privacy-filtered — two different users can legitimately see a different set of posts on page one, so a shared cache key would have leaked private posts across users.
- `PostsService.create`: after creating a post, deletes the author's own `feed:<userId>:first:*` cache keys, so you see your own new post immediately instead of waiting out the 30s TTL. (Other users' feed/explore caches still catch up naturally within 30s — no broader invalidation was added, to keep this change scoped to what was asked.)

## Files changed
- `server/src/posts/posts.service.ts`

## Verification
Playwright + a direct `ioredis` connection to the same Redis instance: hit `GET /posts?limit=10&offset=0` and confirmed a `feed:<userId>:first:10` key appeared with TTL ≤30s; hit `GET /posts/explore?limit=10&offset=0` and confirmed an `explore:<userId>:first:10` key appeared, same TTL; created a real post and confirmed the feed cache key was gone immediately after, and that a fresh `GET /posts` call included the new post right away. `npx tsc --noEmit` clean. Test post cleaned up after the run.
