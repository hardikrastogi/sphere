'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/spinner';

type NotificationType = 'FOLLOW_REQUEST' | 'FOLLOW_ACCEPTED' | 'LIKE' | 'COMMENT';

interface NotificationItem {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: { id: string; username: string; avatarUrl: string | null };
  post: { id: string; media: { url: string; type: 'PHOTO' | 'VIDEO' }[] } | null;
}

interface NotificationsPage {
  notifications: NotificationItem[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const MESSAGES: Record<NotificationType, string> = {
  FOLLOW_REQUEST: 'requested to follow you',
  FOLLOW_ACCEPTED: 'accepted your follow request',
  LIKE: 'liked your post',
  COMMENT: 'commented on your post',
};

async function fetchNotificationsPage(offset: number): Promise<NotificationsPage> {
  const res = await apiFetch(`/notifications?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to load notifications');
  return res.json();
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => fetchNotificationsPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
  });

  const notifications = data?.pages.flatMap((page) => page.notifications) ?? [];

  useEffect(() => {
    apiFetch('/notifications/read-all', { method: 'POST' }).then(() => {
      // Invalidates both ['notifications'] (this page's list) and ['notifications', 'unread-count'] (the nav badge)
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [queryClient]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['follow-requests'] });
  };

  const acceptMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiFetch(`/users/${username}/follow/accept`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to accept request');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Request accepted');
      invalidate();
    },
    onError: () => toast.error('Failed to accept request'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiFetch(`/users/${username}/follow/reject`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reject request');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Request rejected');
      invalidate();
    },
    onError: () => toast.error('Failed to reject request'),
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

  return (
    <div>
      <div className="sticky top-0 border-b bg-background p-4">
        <h1 className="text-lg font-semibold">Notifications</h1>
      </div>

      {isLoading && <Spinner />}
      {!isLoading && notifications.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
      )}

      {notifications.map((n) => {
        const thumb = n.post?.media[0];
        return (
          <div key={n.id} className={`flex items-center gap-3 p-3 ${n.read ? '' : 'bg-blue-50 dark:bg-blue-950/40'}`}>
            <Link href={`/profile/${n.actor.username}`}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={n.actor.avatarUrl ?? undefined} />
                <AvatarFallback>{n.actor.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
            </Link>

            <p className="flex-1 text-sm">
              <Link href={`/profile/${n.actor.username}`} className="font-semibold">
                {n.actor.username}
              </Link>{' '}
              {MESSAGES[n.type]}
            </p>

            {n.type === 'FOLLOW_REQUEST' && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => acceptMutation.mutate(n.actor.username)} disabled={acceptMutation.isPending}>
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rejectMutation.mutate(n.actor.username)}
                  disabled={rejectMutation.isPending}
                >
                  Reject
                </Button>
              </div>
            )}

            {thumb && (
              <div className="h-10 w-10 shrink-0 overflow-hidden bg-muted">
                {thumb.type === 'VIDEO' ? (
                  <video src={thumb.url} className="h-full w-full object-cover" />
                ) : (
                  <img src={thumb.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            )}
          </div>
        );
      })}

      <div ref={loadMoreRef} className="h-10" />
      {isFetchingNextPage && <Spinner />}
    </div>
  );
}
