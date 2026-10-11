'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Spinner } from '@/components/spinner';

interface Story {
  id: string;
  url: string;
  type: 'PHOTO' | 'VIDEO';
  createdAt: string;
}

interface StoryViewerEntry {
  viewedAt: string;
  viewer: { id: string; username: string; avatarUrl: string | null };
}

async function fetchAuthorStories(authorId: string): Promise<Story[]> {
  const res = await apiFetch(`/stories/user/${authorId}`);
  if (!res.ok) throw new Error('Failed to load stories');
  return res.json();
}

async function fetchViewers(storyId: string): Promise<StoryViewerEntry[]> {
  const res = await apiFetch(`/stories/${storyId}/views`);
  if (!res.ok) throw new Error('Failed to load viewers');
  return res.json();
}

export function StoryViewer({
  authorId,
  username,
  isOwnStory = false,
  onClose,
}: {
  authorId: string;
  username: string;
  isOwnStory?: boolean;
  onClose: () => void;
}) {
  const { data: stories } = useQuery({
    queryKey: ['stories', 'author', authorId],
    queryFn: () => fetchAuthorStories(authorId),
  });

  const [index, setIndex] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const current = stories?.[index];

  const { data: viewers, isLoading: viewersLoading } = useQuery({
    queryKey: ['stories', 'views', current?.id],
    queryFn: () => fetchViewers(current!.id),
    enabled: isOwnStory && showViewers && !!current,
  });

  useEffect(() => {
    if (!current) return;
    apiFetch(`/stories/${current.id}/view`, { method: 'POST' });
  }, [current?.id]);

  // Auto-advance pauses while the viewer list is open, so it can't skip forward mid-read.
  useEffect(() => {
    if (!stories || stories.length === 0 || showViewers) return;
    const timer = setTimeout(() => {
      if (index < stories.length - 1) setIndex((i) => i + 1);
      else onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [index, stories, onClose, showViewers]);

  if (!stories || stories.length === 0 || !current) return null;

  const goNext = () => {
    if (index < stories.length - 1) setIndex((i) => i + 1);
    else onClose();
  };
  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-md">
        <div className="absolute left-2 right-2 top-2 z-10 flex gap-1">
          {stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              {i < index ? (
                <div className="h-full w-full bg-white" />
              ) : i === index ? (
                <div
                  key={index}
                  className="h-full bg-white animate-[story-progress_5s_linear_forwards]"
                  style={{ animationPlayState: showViewers ? 'paused' : 'running' }}
                />
              ) : (
                <div className="h-full w-0 bg-white" />
              )}
            </div>
          ))}
        </div>

        <div className="absolute left-3 top-6 z-10 text-sm font-semibold text-white">{username}</div>
        <button onClick={onClose} className="absolute right-3 top-5 z-10 text-white">
          <X className="h-6 w-6" />
        </button>

        {current.type === 'VIDEO' ? (
          <video src={current.url} autoPlay className="h-full w-full object-contain" />
        ) : (
          <img src={current.url} alt="" className="h-full w-full object-contain" />
        )}

        {!showViewers && (
          <>
            <button onClick={goPrev} className="absolute left-0 top-0 h-full w-1/2" aria-label="Previous" />
            <button onClick={goNext} className="absolute right-0 top-0 h-full w-1/2" aria-label="Next" />
          </>
        )}

        {isOwnStory && (
          <button
            onClick={() => setShowViewers(true)}
            className="absolute bottom-4 left-3 z-10 flex items-center gap-1.5 text-sm font-semibold text-white"
          >
            <Eye className="h-4 w-4" />
            Viewers
          </button>
        )}

        {showViewers && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-2xl bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-4">
              <p className="text-sm font-semibold">Viewers</p>
              <button onClick={() => setShowViewers(false)} aria-label="Close viewers">
                <X className="h-5 w-5" />
              </button>
            </div>

            {viewersLoading && <Spinner />}
            {!viewersLoading && viewers?.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No views yet.</p>
            )}
            {viewers?.map((v) => (
              <div key={v.viewer.id} className="flex items-center gap-3 p-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={v.viewer.avatarUrl ?? undefined} />
                  <AvatarFallback>{v.viewer.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold">{v.viewer.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
