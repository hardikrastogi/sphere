import { API_URL } from './config';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }

  return res;
}