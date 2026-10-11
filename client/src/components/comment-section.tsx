'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/spinner';

interface Comment {
  id: string;
  text: string;
  user: { username: string; avatarUrl: string | null };
}

export function CommentSection({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/posts/${postId}/comments`)
      .then((res) => res.json())
      .then(setComments)
      .finally(() => setLoading(false));
  }, [postId]);

  const submitComment = async () => {
    if (!text.trim()) return;
    const res = await apiFetch(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const newComment = await res.json();
      setComments((c) => [...c, newComment]);
      setText('');
    } else {
      toast.error('Failed to post comment');
    }
  };

  return (
    <div className="border-t px-3 py-2">
      {loading ? (
        <Spinner />
      ) : (
        comments.map((c) => (
          <p key={c.id} className="py-1 text-sm">
            <span className="font-semibold">{c.user.username}</span> {c.text}
          </p>
        ))
      )}
      <div className="flex gap-2 pt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 border-none text-sm outline-none"
          onKeyDown={(e) => e.key === 'Enter' && submitComment()}
        />
        <button onClick={submitComment} className="text-sm font-semibold text-blue-500">
          Post
        </button>
      </div>
    </div>
  );
}