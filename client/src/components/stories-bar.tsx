'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { StoryViewer } from '@/components/story-viewer';

interface StoryGroup {
  author: { id: string; username: string; avatarUrl: string | null };
  storyIds: string[];
  allSeen: boolean;
}

interface Me {
  id: string;
  avatarUrl: string | null;
}

async function fetchActiveStories(): Promise<StoryGroup[]> {
  const res = await apiFetch('/stories/active');
  if (!res.ok) throw new Error('Failed to load stories');
  return res.json();
}

async function fetchMe(): Promise<Me> {
  const res = await apiFetch('/users/me');
  if (!res.ok) throw new Error('Failed to load current user');
  return res.json();
}

export function StoriesBar() {
  const { data: groups } = useQuery({
    queryKey: ['stories', 'active'],
    queryFn: fetchActiveStories,
  });
  const { data: me } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: fetchMe,
  });

  const [openAuthor, setOpenAuthor] = useState<{ id: string; username: string } | null>(null);

  const myGroup = groups?.find((g) => g.author.id === me?.id);
  const otherGroups = groups?.filter((g) => g.author.id !== me?.id);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b p-2">
        {/* One slot for "you" - never a separate upload button and story ring at once.
            No active story: plain upload button. Active story: the ring (click to view) with a
            small "+" badge overlaid to add another, same as Instagram's own-story treatment. */}
        {myGroup ? (
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setOpenAuthor({ id: myGroup.author.id, username: myGroup.author.username })}
              >
                <div
                  className={`rounded-2xl p-[2px] ${
                    myGroup.allSeen ? 'bg-muted' : 'bg-gradient-to-br from-primary via-fuchsia-500 to-accent-foreground'
                  }`}
                >
                  <Avatar className="h-11 w-11 rounded-xl border-2 border-background">
                    <AvatarImage src={myGroup.author.avatarUrl ?? undefined} />
                    <AvatarFallback>{myGroup.author.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
              </button>
              <Link
                href="/create-story"
                className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-2 ring-background"
              >
                <Plus className="h-2.5 w-2.5 text-primary-foreground" />
              </Link>
            </div>
            <span className="text-[11px]">Your story</span>
          </div>
        ) : (
          <Link href="/create-story" className="flex flex-col items-center gap-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-dashed border-border">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-[11px]">Your story</span>
          </Link>
        )}

        {otherGroups?.map((group) => (
          <button
            key={group.author.id}
            onClick={() => setOpenAuthor({ id: group.author.id, username: group.author.username })}
            className="flex flex-col items-center gap-1"
          >
            <div
              className={`rounded-2xl p-[2px] ${
                group.allSeen ? 'bg-muted' : 'bg-gradient-to-br from-primary via-fuchsia-500 to-accent-foreground'
              }`}
            >
              <Avatar className="h-11 w-11 rounded-xl border-2 border-background">
                <AvatarImage src={group.author.avatarUrl ?? undefined} />
                <AvatarFallback>{group.author.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <span className="w-14 truncate text-center text-[11px]">{group.author.username}</span>
          </button>
        ))}
      </div>

      {openAuthor && (
        <StoryViewer
          authorId={openAuthor.id}
          username={openAuthor.username}
          isOwnStory={openAuthor.id === me?.id}
          onClose={() => setOpenAuthor(null)}
        />
      )}
    </>
  );
}