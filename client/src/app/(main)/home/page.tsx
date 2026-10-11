'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PostCard } from '@/components/post-card';
import { apiFetch } from '@/lib/api';
import { StoriesBar } from '@/components/stories-bar';
import { Spinner } from '@/components/spinner';
import { TopBar } from '@/components/top-bar';

interface Post {
  id: string;
  caption: string | null;
  createdAt: string;
  author: { username: string; avatarUrl: string | null };
  media: { url: string; type: 'PHOTO' | 'VIDEO' }[];
  likes: { id: string }[];
  _count: { likes: number };
}

interface FeedPage {
  posts: Post[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 10;

async function fetchFeedPage({ pageParam }: { pageParam: number }): Promise<FeedPage> {
  const res = await apiFetch(`/posts?limit=${PAGE_SIZE}&offset=${pageParam}`);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export default function HomePage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: fetchFeedPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
  });

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

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  return (
    <div className="pb-6">
      <TopBar />
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="p-6 text-center text-sm text-red-500">Couldn't load the feed.</p>
      ) : posts.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No posts yet.</p>
      ) : (
        <>
          <StoriesBar />
          <div className="px-3 pt-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              id={post.id}
              author={post.author}
              caption={post.caption}
              media={post.media}
              createdAt={post.createdAt}
              likedByMe={post.likes.length > 0}
              likeCount={post._count.likes}
            />
          ))}
          </div>
          <div ref={loadMoreRef} className="h-10" />
          {isFetchingNextPage && <Spinner />}
        </>
      )}
    </div>
  );
}