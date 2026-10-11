'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/config';
import { Spinner } from '@/components/spinner';

// Can't let middleware handle this redirect (it used to) - the auth cookie lives on the
// backend's own domain, invisible to Next's edge middleware running on the frontend's
// domain in a split-domain deployment. Ask the backend directly instead.
export default function RootPage() {
  const router = useRouter();
  const { isSuccess, isError } = useQuery({
    queryKey: ['users', 'me', 'auth-check'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (isSuccess) router.replace('/home');
    if (isError) router.replace('/login');
  }, [isSuccess, isError, router]);

  return <Spinner />;
}
