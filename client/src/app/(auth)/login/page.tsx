'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import { setUser } from '@/store/authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogoMark } from '@/components/logo';
import { API_URL } from '@/lib/config';
import { useRedirectIfAuthed } from '@/hooks/useRedirectIfAuthed';
import Link from 'next/link';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  useRedirectIfAuthed();
  const router = useRouter();
  const dispatch = useDispatch();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message);
      return;
    }
    const { user } = await res.json();
    dispatch(setUser(user));
    router.push('/home');
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
        <div className="flex justify-center pb-2">
          <LogoMark className="h-16 w-16 text-black [animation:logo-intro_0.6s_ease-out] dark:text-white" />
        </div>
        <h1 className="text-2xl font-bold">Log in to Sphere</h1>
        <div>
          <Input placeholder="Email" {...register('email')} />
          {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
        </div>
        <div>
          <Input type="password" placeholder="Password" {...register('password')} />
          {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </Button>
        <a href={`${API_URL}/auth/google`} className="block text-center text-sm underline">
          Continue with Google
        </a>
        <p className="text-center text-sm">
          Don't have an account? <Link href="/signup" className="underline">Sign up</Link>
        </p>
      </form>
    </div>
  );
}