'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { uploadToCloudinary } from '@/lib/upload';
import { Spinner } from '@/components/spinner';

interface Me {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
}

async function fetchMe(): Promise<Me> {
  const res = await apiFetch('/users/me');
  if (!res.ok) throw new Error('Failed to load current user');
  return res.json();
}

export default function EditProfilePage() {
  const router = useRouter();
  const { data: me, isLoading } = useQuery({ queryKey: ['users', 'me'], queryFn: fetchMe });

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!me) return;
    setUsername(me.username);
    setBio(me.bio ?? '');
    setAvatarUrl(me.avatarUrl);
  }, [me]);

  const onAvatarChange = async (file: File | null) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const { url } = await uploadToCloudinary(file);
      setAvatarUrl(url);
    } finally {
      setIsUploading(false);
    }
  };

  const onSave = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ username, bio, avatarUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message);
        return;
      }
      toast.success('Profile updated');
      router.push(`/profile/${username}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Edit Profile</h1>

      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{username[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
          />
          {isUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Username</label>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Bio</label>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={150} />
      </div>

      <Button onClick={onSave} disabled={isSaving || isUploading} className="w-full">
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
