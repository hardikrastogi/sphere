'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { ArrowLeft, Clock, LogOut, Lock, Moon, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/spinner';
import { apiFetch } from '@/lib/api';
import { formatTimeSpent, getTimeSpentMs } from '@/lib/time-tracker';
import { clearAllChatDrafts } from '@/lib/chat-drafts';

interface Me {
  id: string;
  username: string;
  isPrivate: boolean;
  showActivityStatus: boolean;
}

async function fetchMe(): Promise<Me> {
  const res = await apiFetch('/users/me');
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

function SettingRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: me, isLoading } = useQuery({ queryKey: ['users', 'me', 'settings'], queryFn: fetchMe });

  const [timeSpentMs, setTimeSpentMs] = useState(0);
  useEffect(() => {
    setTimeSpentMs(getTimeSpentMs());
    const interval = setInterval(() => setTimeSpentMs(getTimeSpentMs()), 5000);
    return () => clearInterval(interval);
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Pick<Me, 'isPrivate' | 'showActivityStatus'>>) => {
      const res = await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(data) });
      if (!res.ok) throw new Error('Failed to update settings');
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['users', 'me', 'settings'], updated);
    },
    onError: () => toast.error('Failed to update setting'),
  });

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to log out');
    },
    onSuccess: () => {
      clearAllChatDrafts();
      router.push('/login');
    },
    onError: () => toast.error('Failed to log out'),
  });

  if (isLoading || !mounted) return <Spinner />;
  if (!me) return <p className="p-6 text-center text-sm text-muted-foreground">Something went wrong.</p>;

  const isDark = resolvedTheme === 'dark';

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 border-b p-4">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="divide-y">
        <SettingRow
          icon={<Lock className="h-5 w-5" />}
          title="Private account"
          description="Only approved followers can see your posts"
          checked={me.isPrivate}
          onCheckedChange={(checked) => updateMutation.mutate({ isPrivate: checked })}
          disabled={updateMutation.isPending}
        />
        <SettingRow
          icon={<Moon className="h-5 w-5" />}
          title="Dark mode"
          description="Switch between light and dark theme"
          checked={isDark}
          onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        />
        <SettingRow
          icon={<Radio className="h-5 w-5" />}
          title="Live activity status"
          description="Let people you message see when you're online"
          checked={me.showActivityStatus}
          onCheckedChange={(checked) => updateMutation.mutate({ showActivityStatus: checked })}
          disabled={updateMutation.isPending}
        />

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="text-muted-foreground">
            <Clock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Time spent on Sphere</p>
            <p className="text-xs text-muted-foreground">Tracked on this device only</p>
          </div>
          <p className="text-sm font-semibold">{formatTimeSpent(timeSpentMs)}</p>
        </div>
      </div>

      <div className="p-4">
        {confirmingLogout ? (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Confirm log out
            </Button>
            <Button variant="outline" onClick={() => setConfirmingLogout(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setConfirmingLogout(true)}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        )}
      </div>
    </div>
  );
}
