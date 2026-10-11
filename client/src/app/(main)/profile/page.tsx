'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/spinner';

async function fetchMe(): Promise<{ username: string }> {
  const res = await apiFetch('/users/me');
  if (!res.ok) throw new Error('Failed to load current user');
  return res.json();
}

export default function MyProfileRedirectPage() {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['users', 'me'], queryFn: fetchMe });

  useEffect(() => {
    if (data?.username) router.replace(`/profile/${data.username}`);
  }, [data, router]);

  return <Spinner />;
}
