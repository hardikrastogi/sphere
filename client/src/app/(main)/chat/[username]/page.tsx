'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCheck, Phone, Video } from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useCallContext } from '@/contexts/call-context';
import { PostModal } from '@/components/post-modal';
import { CHAT_DRAFT_KEY_PREFIX } from '@/lib/chat-drafts';

interface SharedPost {
  id: string;
  caption: string | null;
  media: { url: string; type: 'PHOTO' | 'VIDEO' }[];
  author: { username: string; avatarUrl: string | null };
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  read: boolean;
  createdAt: string;
  sharedPost?: SharedPost | null;
}

interface ConversationInfo {
  id: string;
  otherUser: { id: string; username: string; avatarUrl: string | null; online: boolean };
}

interface MessagesPage {
  messages: Message[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 30;
const TYPING_EMIT_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 4000;

async function fetchConversation(username: string): Promise<ConversationInfo> {
  const res = await apiFetch(`/chat/conversations/${username}`);
  if (!res.ok) throw new Error('Failed to open conversation');
  return res.json();
}

async function fetchMessages(conversationId: string, offset: number): Promise<MessagesPage> {
  const res = await apiFetch(`/chat/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to load messages');
  return res.json();
}

export default function ConversationPage() {
  const { username } = useParams<{ username: string }>();
  const queryClient = useQueryClient();

  const { data: conversation } = useQuery({
    queryKey: ['chat', 'conversation', username],
    queryFn: () => fetchConversation(username),
  });

  const conversationId = conversation?.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [openSharedPostId, setOpenSharedPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages(conversationId, 0).then((page) => {
      setMessages(page.messages);
      setHasMoreOlder(page.hasMore);
    });
    apiFetch(`/chat/conversations/${conversationId}/read`, { method: 'POST' }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    });
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    const onNewMessage = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => [...prev, message]);
      setIsOtherTyping(false);
      apiFetch(`/chat/conversations/${conversationId}/read`, { method: 'POST' }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['chat', 'unread-count'] });
      });
    };
    const onError = (err: { message: string }) => toast.error(err.message);

    socket.on('new_message', onNewMessage);
    socket.on('send_message_error', onError);
    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('send_message_error', onError);
    };
  }, [conversationId, queryClient]);

  // Typing indicator: listen for the other participant's typing/stop_typing events,
  // with a fallback timeout in case a "stop_typing" event never arrives (e.g. they
  // closed the tab mid-type) so the indicator can't get stuck forever.
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId || !conversation) return;
    const socket = getSocket();

    const clearTypingTimer = () => {
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
      typingClearTimer.current = null;
    };

    const onTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== conversationId || payload.userId !== conversation.otherUser.id) return;
      setIsOtherTyping(true);
      clearTypingTimer();
      typingClearTimer.current = setTimeout(() => setIsOtherTyping(false), TYPING_INDICATOR_TIMEOUT_MS);
    };
    const onStopTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== conversationId || payload.userId !== conversation.otherUser.id) return;
      clearTypingTimer();
      setIsOtherTyping(false);
    };

    socket.on('typing', onTyping);
    socket.on('stop_typing', onStopTyping);
    return () => {
      socket.off('typing', onTyping);
      socket.off('stop_typing', onStopTyping);
      clearTypingTimer();
      setIsOtherTyping(false);
    };
  }, [conversationId, conversation]);

  // Read receipts: when the other participant marks this conversation read,
  // reflect that on every message we've sent so far.
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    const onMessagesRead = (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m.read ? m : { ...m, read: true })));
    };
    socket.on('messages_read', onMessagesRead);
    return () => {
      socket.off('messages_read', onMessagesRead);
    };
  }, [conversationId]);

  // Online/offline presence for the header dot.
  useEffect(() => {
    if (!conversation) return;
    const socket = getSocket();
    const refetch = (payload: { userId: string }) => {
      if (payload.userId !== conversation.otherUser.id) return;
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', username] });
    };
    socket.on('user_online', refetch);
    socket.on('user_offline', refetch);
    return () => {
      socket.off('user_online', refetch);
      socket.off('user_offline', refetch);
    };
  }, [conversation, queryClient, username]);

  const loadOlder = async () => {
    if (!conversationId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages(conversationId, messages.length);
      setMessages((prev) => [...page.messages, ...prev]);
      setHasMoreOlder(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, isOtherTyping]);

  const lastTypingEmitAt = useRef(0);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draftKey = `${CHAT_DRAFT_KEY_PREFIX}${username}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setText((current) => current || saved);
    } catch {}
  }, [draftKey]);

  const handleTextChange = (value: string) => {
    setText(value);
    try {
      if (value) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    } catch {}
    if (!conversationId) return;
    const socket = getSocket();

    if (value.trim()) {
      const now = Date.now();
      if (now - lastTypingEmitAt.current > TYPING_EMIT_THROTTLE_MS) {
        socket.emit('typing', { conversationId });
        lastTypingEmitAt.current = now;
      }
      if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
      stopTypingTimer.current = setTimeout(() => {
        socket.emit('stop_typing', { conversationId });
        lastTypingEmitAt.current = 0;
      }, TYPING_EMIT_THROTTLE_MS);
    } else if (stopTypingTimer.current) {
      clearTimeout(stopTypingTimer.current);
      socket.emit('stop_typing', { conversationId });
      lastTypingEmitAt.current = 0;
    }
  };

  const sendMessage = () => {
    if (!text.trim() || !conversationId) return;
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    getSocket().emit('stop_typing', { conversationId });
    getSocket().emit('send_message', { conversationId, text: text.trim() });
    setText('');
    try {
      window.localStorage.removeItem(draftKey);
    } catch {}
    lastTypingEmitAt.current = 0;
  };

  const lastMineIndex = messages
    .map((m, i) => (m.senderId !== conversation?.otherUser.id ? i : -1))
    .filter((i) => i !== -1)
    .at(-1) ?? -1;

  const call = useCallContext();
  const canCall = !!conversation?.otherUser.online && call.status === 'idle';

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b p-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={conversation?.otherUser.avatarUrl ?? undefined} />
          <AvatarFallback>{conversation?.otherUser.username[0]?.toUpperCase()}</AvatarFallback>
          {conversation?.otherUser.online && <AvatarBadge className="bg-green-500" />}
        </Avatar>
        <div>
          <p className="text-sm font-semibold">{conversation?.otherUser.username}</p>
          {isOtherTyping && <p className="text-xs text-muted-foreground">typing...</p>}
        </div>
        <div className="ml-auto flex gap-3 text-muted-foreground">
          <button
            onClick={() => conversation && call.startCall(conversation.otherUser, 'AUDIO')}
            disabled={!canCall}
            aria-label="Voice call"
            className="disabled:opacity-30"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            onClick={() => conversation && call.startCall(conversation.otherUser, 'VIDEO')}
            disabled={!canCall}
            aria-label="Video call"
            className="disabled:opacity-30"
          >
            <Video className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {hasMoreOlder && (
          <div className="pb-3 text-center">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {loadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.map((m, i) => {
          const isMine = m.senderId !== conversation?.otherUser.id;
          const isLastMine = isMine && i === lastMineIndex;
          return (
            <div key={m.id} className={`mb-2 flex min-w-0 ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className="flex min-w-0 max-w-[75%] flex-col items-end gap-0.5">
                {m.sharedPost ? (
                  <button
                    onClick={() => setOpenSharedPostId(m.sharedPost!.id)}
                    className="w-48 overflow-hidden rounded-2xl border bg-background text-left"
                  >
                    {m.sharedPost.media[0] && (
                      m.sharedPost.media[0].type === 'VIDEO' ? (
                        <video src={m.sharedPost.media[0].url} className="aspect-square w-full object-cover" />
                      ) : (
                        <img src={m.sharedPost.media[0].url} alt="" className="aspect-square w-full object-cover" />
                      )
                    )}
                    <div className="p-2">
                      <p className="text-xs font-semibold">{m.sharedPost.author.username}</p>
                      {m.sharedPost.caption && (
                        <p className="truncate text-xs text-muted-foreground">{m.sharedPost.caption}</p>
                      )}
                    </div>
                  </button>
                ) : (
                  <div
                    className={`w-fit min-w-0 rounded-2xl px-3 py-2 text-sm break-words ${
                      isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.text}
                  </div>
                )}
                {isLastMine && (
                  <span className="flex items-center gap-1 pr-1 text-[10px] text-muted-foreground">
                    {m.read ? (
                      <>
                        <CheckCheck className="h-3 w-3 text-blue-500" /> Seen
                      </>
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {isOtherTyping && (
          <div className="mb-2 flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl bg-muted px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Input
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Message..."
          className="flex-1"
        />
        <Button onClick={sendMessage} disabled={!text.trim()}>
          Send
        </Button>
      </div>

      {openSharedPostId && (
        <PostModal postId={openSharedPostId} onClose={() => setOpenSharedPostId(null)} />
      )}
    </div>
  );
}
