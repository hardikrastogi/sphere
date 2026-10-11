'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Maximize, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { CommentSection } from '@/components/comment-section';
import { ShareModal } from '@/components/share-modal';

interface PostCardProps {
  id: string;
  author: { username: string; avatarUrl: string | null };
  caption: string | null;
  media: { url: string; type: 'PHOTO' | 'VIDEO' }[];
  createdAt: string;
  likedByMe?: boolean;
  likeCount?: number;
}

export function PostCard({ id, author, caption, media, createdAt, likedByMe = false, likeCount = 0 }: PostCardProps) {
  const [liked, setLiked] = useState(likedByMe);
  const [count, setCount] = useState(likeCount);
  const [showComments, setShowComments] = useState(false);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const enterFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen();
  };

  const setLikeState = async (next: boolean) => {
    setLiked(next);
    setCount((c) => (next ? c + 1 : c - 1));

    try {
      const res = await apiFetch(`/posts/${id}/like`, { method: next ? 'POST' : 'DELETE' });
      if (!res.ok) {
        setLiked(!next);
        setCount((c) => (next ? c - 1 : c + 1));
        toast.error('Something went wrong');
      }
    } catch {
      setLiked(!next);
      setCount((c) => (next ? c - 1 : c + 1));
      toast.error('Something went wrong');
    }
  };

  const toggleLike = () => setLikeState(!liked);

  // Double-click only ever likes, never unlikes - matches the standard double-tap-to-like
  // convention, so there's no risk of accidentally removing a like this way.
  const handleDoubleClick = () => {
    if (!liked) setLikeState(true);
    setShowHeartPop(true);
    setTimeout(() => setShowHeartPop(false), 800);
  };

  const primaryMedia = media[0];

  return (
    <div className="mx-auto mb-4 w-full max-w-md overflow-hidden rounded-3xl border bg-card shadow-sm">
      <Link href={`/profile/${author.username}`} className="flex items-center gap-3 p-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={author.avatarUrl ?? undefined} />
          <AvatarFallback>{author.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-semibold">{author.username}</span>
      </Link>

      {primaryMedia && (
        <div className="relative" onDoubleClick={handleDoubleClick}>
          {primaryMedia.type === 'VIDEO' ? (
            <video
              ref={videoRef}
              src={primaryMedia.url}
              autoPlay
              loop
              muted
              playsInline
              className="w-full"
            />
          ) : (
            <img src={primaryMedia.url} alt={caption ?? 'Post image'} className="w-full" />
          )}
          {primaryMedia.type === 'VIDEO' && (
            <button
              onClick={enterFullscreen}
              aria-label="Fullscreen"
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-black/50 text-white"
            >
              <Maximize className="h-4 w-4" />
            </button>
          )}
          {showHeartPop && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Heart className="h-24 w-24 fill-red-500 text-red-500 drop-shadow-lg animate-[heart-pop_0.8s_ease-out]" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 p-2">
        <button onClick={toggleLike} className="rounded-full p-1.5 transition-colors hover:bg-accent">
          <Heart className={`h-6 w-6 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="rounded-full p-1.5 transition-colors hover:bg-accent">
          <MessageCircle className="h-6 w-6" />
        </button>
        <button onClick={() => setShowShareModal(true)} aria-label="Share" className="rounded-full p-1.5 transition-colors hover:bg-accent">
          <Send className="h-6 w-6" />
        </button>
      </div>

      {count > 0 && (
        <p className="px-3 text-sm font-semibold">{count} {count === 1 ? 'like' : 'likes'}</p>
      )}

      {caption && (
        <p className="px-3 text-sm">
          <span className="font-semibold">{author.username}</span> {caption}
        </p>
      )}

      <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">
        {new Date(createdAt).toLocaleDateString('en-US')}
      </p>

      {showComments && <CommentSection postId={id} />}
      {showShareModal && <ShareModal postId={id} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
