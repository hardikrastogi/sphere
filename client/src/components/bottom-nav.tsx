'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Home, Compass, SquarePlus, User, Bell, MessageCircle } from 'lucide-react';
import { cn, truncateText } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/create', label: 'Create', icon: SquarePlus },
  { href: '/chat', label: 'Messages', icon: MessageCircle, badgeKey: 'chat' as const },
  { href: '/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' as const },
  { href: '/profile', label: 'Profile', icon: User },
];

interface IncomingMessage {
  senderId: string;
  text: string;
  sender: { username: string; avatarUrl: string | null };
}

const TOAST_PREVIEW_MAX_LENGTH = 20;

async function fetchUnreadCount(path: string): Promise<number> {
  const res = await apiFetch(path);
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count;
}

async function fetchMe(): Promise<{ id: string }> {
  const res = await apiFetch('/users/me');
  if (!res.ok) throw new Error('Failed to load current user');
  return res.json();
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: notificationsUnread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => fetchUnreadCount('/notifications/unread-count'),
    refetchInterval: 30000,
  });

  const { data: chatUnread } = useQuery({
    queryKey: ['chat', 'unread-count'],
    queryFn: () => fetchUnreadCount('/chat/unread-count'),
    refetchInterval: 30000,
  });

  const { data: me } = useQuery({ queryKey: ['users', 'me'], queryFn: fetchMe });

  // New messages arrive over the socket in real time, so refresh the badge
  // immediately instead of waiting for the next 30s poll, and pop a toast for
  // anything that isn't your own message or the conversation you're already viewing.
  useEffect(() => {
    const socket = getSocket();
    const onNewMessage = (message: IncomingMessage) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread-count'] });

      if (message.senderId === me?.id) return;
      if (pathname === `/chat/${message.sender.username}`) return;

      toast(message.sender.username, {
        description: truncateText(message.text, TOAST_PREVIEW_MAX_LENGTH),
        action: {
          label: 'View',
          onClick: () => router.push(`/chat/${message.sender.username}`),
        },
      });
    };
    socket.on('new_message', onNewMessage);
    return () => {
      socket.off('new_message', onNewMessage);
    };
  }, [queryClient, me?.id, pathname, router]);

  const badges: Record<string, number | undefined> = {
    notifications: notificationsUnread,
    chat: chatUnread,
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 border-t bg-background p-2">
      {NAV_ITEMS.map(({ href, label, icon: Icon, badgeKey }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        const count = badgeKey ? badges[badgeKey] : undefined;
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
            {!!count && (
              <span className="absolute top-1 right-[calc(50%-18px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
