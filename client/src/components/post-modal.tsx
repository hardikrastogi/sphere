'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PostCard } from '@/components/post-card';
import { Spinner } from '@/components/spinner';

interface PostDetail {
  id: string;
  caption: string | null;
  createdAt: string;
  media: { url: string; type: 'PHOTO' | 'VIDEO' }[];
  author: { username: string; avatarUrl: string | null };
  likes: { id: string }[];
  _count: { likes: number };
}

async function fetchPost(postId: string): Promise<PostDetail> {
  const res = await apiFetch(`/posts/${postId}`);
  if (!res.ok) throw new Error('Failed to load post');
  return res.json();
}

/** Opened from the explore grid (or anywhere else that only has a post id) - fetches the
 * full post and renders it with the same PostCard used on the home feed, so the author's
 * clickable/verified username, the like button, and comments all come for free. */
export function PostModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { data: post, isLoading } = useQuery({
    queryKey: ['posts', postId],
    queryFn: () => fetchPost(postId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="mb-2 ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-background">
          <X className="h-5 w-5" />
        </button>

        {isLoading || !post ? (
          <Spinner />
        ) : (
          <PostCard
            id={post.id}
            author={post.author}
            caption={post.caption}
            media={post.media}
            createdAt={post.createdAt}
            likedByMe={post.likes.length > 0}
            likeCount={post._count.likes}
          />
        )}
      </div>
    </div>
  );
}
