'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/spinner';

interface FollowRequest {
  id: string;
  createdAt: string;
  follower: { id: string; username: string; avatarUrl: string | null };
}

async function fetchRequests(): Promise<FollowRequest[]> {
  const res = await apiFetch('/follow-requests');
  if (!res.ok) throw new Error('Failed to load follow requests');
  return res.json();
}

export default function FollowRequestsPage() {
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ['follow-requests'],
    queryFn: fetchRequests,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['follow-requests'] });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/follow-requests/${id}/accept`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to accept request');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Request accepted');
      invalidate();
    },
    onError: () => toast.error('Failed to accept request'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/follow-requests/${id}/reject`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reject request');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Request rejected');
      invalidate();
    },
    onError: () => toast.error('Failed to reject request'),
  });

  return (
    <div>
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">Follow Requests</h1>
      </div>

      {isLoading && <Spinner />}
      {!isLoading && requests?.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">No pending requests.</p>
      )}

      {requests?.map((request) => (
        <div key={request.id} className="flex items-center gap-3 p-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={request.follower.avatarUrl ?? undefined} />
            <AvatarFallback>{request.follower.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="flex-1 text-sm font-semibold">{request.follower.username}</span>
          <Button size="sm" onClick={() => acceptMutation.mutate(request.id)} disabled={acceptMutation.isPending}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => rejectMutation.mutate(request.id)}
            disabled={rejectMutation.isPending}
          >
            Reject
          </Button>
        </div>
      ))}
    </div>
  );
}
