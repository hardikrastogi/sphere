'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/spinner';

async function fetchMe() {
  const res = await apiFetch('/users/me');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

/** Can't rely on middleware reading the auth cookie - the frontend and backend live on
 * different domains in production, so a cookie the backend sets is never visible to
 * Next's edge middleware running on the frontend's own domain. Ask the backend directly
 * instead; the cookie IS correctly sent on this cross-site fetch (that's what the
 * SameSite=None/Secure cookie settings are actually for). */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isError } = useQuery({
    queryKey: ['users', 'me', 'auth-check'],
    queryFn: fetchMe,
    retry: false,
  });

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isLoading || isError) return <Spinner />;
  return <>{children}</>;
}
