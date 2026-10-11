'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useQueryState } from 'nuqs';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { PostModal } from '@/components/post-modal';
import { Spinner } from '@/components/spinner';

interface ExplorePost {
  id: string;
  media: { url: string; type: 'PHOTO' | 'VIDEO' }[];
}

interface ExplorePage {
  posts: ExplorePost[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

interface UserResult {
  id: string;
  username: string;
  avatarUrl: string | null;
}

const PAGE_SIZE = 10;

async function fetchExplorePage({ pageParam }: { pageParam: number }): Promise<ExplorePage> {
  const res = await apiFetch(`/posts/explore?limit=${PAGE_SIZE}&offset=${pageParam}`);
  if (!res.ok) throw new Error('Failed to load explore feed');
  return res.json();
}

async function searchUsers(query: string): Promise<UserResult[]> {
  const res = await apiFetch(`/users/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ExploreContent />
    </Suspense>
  );
}

// useQueryState (nuqs) reads useSearchParams internally, which requires a Suspense
// boundary around it or `next build`'s static prerendering fails outright.
function ExploreContent() {
  const [q, setQ] = useQueryState('q', { defaultValue: '' });
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const {
    data,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['explore'],
    queryFn: fetchExplorePage,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    enabled: debouncedQ.length === 0,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'search', debouncedQ],
    queryFn: () => searchUsers(debouncedQ),
    enabled: debouncedQ.length > 0,
  });

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-background p-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
        />
      </div>

      {debouncedQ.length > 0 ? (
        <div className="p-2">
          {usersLoading && <Spinner />}
          {!usersLoading && users?.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No users found.</p>
          )}
          {users?.map((u) => (
            <Link
              key={u.id}
              href={`/profile/${u.username}`}
              className="flex items-center gap-3 p-2 hover:bg-muted"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={u.avatarUrl ?? undefined} />
                <AvatarFallback>{u.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold">{u.username}</span>
            </Link>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-1 p-1">
            {postsLoading && <div className="col-span-6"><Spinner /></div>}
            {posts.map((post, i) => {
              const media = post.media[0];
              // Instagram-style mosaic: a large 2x2 tile every 7 posts (starting after a
              // few normal ones), everything else a normal small tile. A fixed interval
              // rather than true per-load randomness, so two large tiles never land next
              // to each other and break the grid.
              const isLarge = i % 7 === 3;
              return (
                <button
                  key={post.id}
                  onClick={() => setOpenPostId(post.id)}
                  className={`relative aspect-square overflow-hidden bg-muted ${
                    isLarge ? 'col-span-2 row-span-2' : ''
                  }`}
                >
                  {media?.type === 'VIDEO' ? (
                    <video src={media.url} className="h-full w-full object-cover" />
                  ) : (
                    <img src={media?.url} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
          <div ref={loadMoreRef} className="h-10" />
          {isFetchingNextPage && <Spinner />}
        </>
      )}

      {openPostId && <PostModal postId={openPostId} onClose={() => setOpenPostId(null)} />}
    </div>
  );
}
