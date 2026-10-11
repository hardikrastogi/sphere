'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Spinner } from '@/components/spinner';
import { apiFetch } from '@/lib/api';

interface UserSummary {
  id: string;
  username: string;
  avatarUrl: string | null;
}

type ListType = 'followers' | 'following';

async function fetchList(username: string, type: ListType): Promise<UserSummary[]> {
  const res = await apiFetch(`/users/${username}/${type}`);
  if (!res.ok) throw new Error(res.status === 403 ? 'This account is private' : 'Failed to load list');
  return res.json();
}

export function FollowListModal({
  username,
  type,
  onClose,
}: {
  username: string;
  type: ListType;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['users', username, type],
    queryFn: () => fetchList(username, type),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-background sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <p className="text-sm font-semibold">{type === 'followers' ? 'Followers' : 'Following'}</p>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading && <Spinner />}
        {isError && (
          <p className="p-6 text-center text-sm text-muted-foreground">{(error as Error).message}</p>
        )}
        {!isLoading && !isError && data?.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
          </p>
        )}
        {data?.map((u) => (
          <Link
            key={u.id}
            href={`/profile/${u.username}`}
            onClick={onClose}
            className="flex items-center gap-3 p-3 hover:bg-muted"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={u.avatarUrl ?? undefined} />
              <AvatarFallback>{u.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">{u.username}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
