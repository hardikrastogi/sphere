'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Spinner } from '@/components/spinner';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface ConversationSummary {
  id: string;
  otherUser: { id: string; username: string; avatarUrl: string | null };
}

async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await apiFetch('/chat/conversations');
  if (!res.ok) throw new Error('Failed to load conversations');
  return res.json();
}

/** Lets you share a post into one of your existing chats - picks a conversation, sends the
 * post as a special message (via the same socket path regular messages use, just with
 * sharedPostId set), which the chat page then renders as a small preview card. */
export function ShareModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: fetchConversations,
  });

  const shareTo = (conversationId: string, username: string) => {
    getSocket().emit('send_message', { conversationId, text: '', sharedPostId: postId });
    toast.success(`Shared with ${username}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <p className="text-sm font-semibold">Share to...</p>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading && <Spinner />}
        {!isLoading && conversations?.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No conversations yet. Message someone first to share posts with them.
          </p>
        )}

        {conversations?.map((c) => (
          <button
            key={c.id}
            onClick={() => shareTo(c.id, c.otherUser.username)}
            className="flex w-full items-center gap-3 p-3 hover:bg-muted"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={c.otherUser.avatarUrl ?? undefined} />
              <AvatarFallback>{c.otherUser.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">{c.otherUser.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
