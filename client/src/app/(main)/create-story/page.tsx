'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadToCloudinary } from '@/lib/upload';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function CreateStoryPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!file) return;
    setIsSubmitting(true);
    try {
      const { url, publicId } = await uploadToCloudinary(file);
      const type = file.type.startsWith('video') ? 'VIDEO' : 'PHOTO';

      const res = await apiFetch('/stories', {
        method: 'POST',
        body: JSON.stringify({ url, publicId, type }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message);
        return;
      }

      toast.success('Story shared!');
      router.push('/home');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-2xl font-bold">New story</h1>
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button onClick={onSubmit} disabled={!file || isSubmitting} className="w-full">
        {isSubmitting ? 'Posting...' : 'Share to story'}
      </Button>
    </div>
  );
}