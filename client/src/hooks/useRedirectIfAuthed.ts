'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/config';

/** Sends an already-logged-in visitor away from /login or /signup to /home. Done
 * client-side (not in middleware) for the same reason AuthGuard is - the auth cookie
 * lives on the backend's domain, which Next's edge middleware on the frontend's own
 * domain can never see in a split-domain deployment.
 *
 * Uses a plain fetch, not apiFetch - apiFetch auto-redirects to /login on a 401, which
 * on this exact page (checking from /login itself) would be an infinite reload loop for
 * every logged-out visitor. */
export function useRedirectIfAuthed() {
  const router = useRouter();
  const { isSuccess } = useQuery({
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
  }, [isSuccess, router]);
}
