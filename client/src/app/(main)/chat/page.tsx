'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { truncateText } from '@/lib/utils';
import { Spinner } from '@/components/spinner';

const LIST_PREVIEW_MAX_LENGTH = 45;

interface ConversationSummary {
  id: string;
  otherUser: { id: string; username: string; avatarUrl: string | null; online: boolean };
  lastMessage: { text: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
}

async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await apiFetch('/chat/conversations');
  if (!res.ok) throw new Error('Failed to load conversations');
  return res.json();
}

export default function ChatListPage() {
  const queryClient = useQueryClient();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: fetchConversations,
  });

  // New messages (sent or received) change the list's last-message preview and
  // ordering, and online/offline status changes the presence dot - refetch on any
  // of these while this page is open.
  useEffect(() => {
    const socket = getSocket();
    const refetch = () => queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    socket.on('new_message', refetch);
    socket.on('user_online', refetch);
    socket.on('user_offline', refetch);
    return () => {
      socket.off('new_message', refetch);
      socket.off('user_online', refetch);
      socket.off('user_offline', refetch);
    };
  }, [queryClient]);

  return (
    <div>
      <div className="sticky top-0 border-b bg-background p-4">
        <h1 className="text-lg font-semibold">Messages</h1>
      </div>

      {isLoading && <Spinner />}
      {!isLoading && conversations?.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No conversations yet. Visit a profile and tap Message to start one.
        </p>
      )}

      {conversations?.map((c) => (
        <Link
          key={c.id}
          href={`/chat/${c.otherUser.username}`}
          className="flex items-center gap-3 p-3 hover:bg-muted"
        >
          <Avatar className="h-12 w-12">
            <AvatarImage src={c.otherUser.avatarUrl ?? undefined} />
            <AvatarFallback>{c.otherUser.username[0].toUpperCase()}</AvatarFallback>
            {c.otherUser.online && <AvatarBadge className="bg-green-500" />}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{c.otherUser.username}</p>
            <p className="truncate text-sm text-muted-foreground">
              {c.lastMessage ? truncateText(c.lastMessage.text, LIST_PREVIEW_MAX_LENGTH) : 'Say hello!'}
            </p>
          </div>
          {c.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
              {c.unreadCount > 9 ? '9+' : c.unreadCount}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
