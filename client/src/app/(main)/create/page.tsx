'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadToCloudinary } from '@/lib/upload';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function CreatePostPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!file) return;
    setIsSubmitting(true);
    try {
      const { url, publicId } = await uploadToCloudinary(file);
      const type = file.type.startsWith('video') ? 'VIDEO' : 'PHOTO';

      const res = await apiFetch('/posts', {
        method: 'POST',
        body: JSON.stringify({ caption, media: [{ url, publicId, type }] }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message);
        return;
      }

      toast.success('Post shared!');
      router.push('/home');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-2xl font-bold">New post</h1>
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Textarea
        placeholder="Write a caption..."
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <Button onClick={onSubmit} disabled={!file || isSubmitting} className="w-full">
        {isSubmitting ? 'Posting...' : 'Share'}
      </Button>
    </div>
  );
}