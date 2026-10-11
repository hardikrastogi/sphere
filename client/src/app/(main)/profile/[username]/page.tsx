'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock, MoreVertical } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PostModal } from '@/components/post-modal';
import { FollowListModal } from '@/components/follow-list-modal';
import { Spinner } from '@/components/spinner';
import { apiFetch } from '@/lib/api';

interface Profile {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isSelf: boolean;
  relationship: 'SELF' | 'ACCEPTED' | 'PENDING' | 'NOT_FOLLOWING';
  canViewPosts: boolean;
}

interface ProfilePost {
  id: string;
  media: { url: string; type: 'PHOTO' | 'VIDEO' }[];
}

interface ProfilePostsPage {
  posts: ProfilePost[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 12;

async function fetchProfile(username: string): Promise<Profile> {
  const res = await apiFetch(`/users/${username}`);
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

async function fetchProfilePostsPage(username: string, offset: number): Promise<ProfilePostsPage> {
  const res = await apiFetch(`/users/${username}/posts?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to load posts');
  return res.json();
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const queryClient = useQueryClient();
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openConnections, setOpenConnections] = useState<'followers' | 'following' | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => fetchProfile(username),
  });

  const invalidateProfile = () => queryClient.invalidateQueries({ queryKey: ['profile', username] });

  const followMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/users/${username}/follow`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to follow');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Follow request sent');
      invalidateProfile();
    },
    onError: () => toast.error('Failed to send follow request'),
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/users/${username}/follow`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unfollow');
      return res.json();
    },
    onSuccess: invalidateProfile,
    onError: () => toast.error('Something went wrong'),
  });

  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['profile-posts', username],
    queryFn: ({ pageParam }) => fetchProfilePostsPage(username, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    enabled: !!profile?.canViewPosts,
  });

  const posts = postsData?.pages.flatMap((page) => page.posts) ?? [];

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  if (isLoading) return <Spinner />;
  if (!profile) return <p className="p-6 text-center text-sm text-muted-foreground">User not found.</p>;

  return (
    <div className="pb-6">
      {profile.isSelf && (
        <div className="flex items-center justify-between p-4 pb-0">
          <p className="text-lg font-semibold">{profile.username}</p>
          <Link href="/settings">
            <Button variant="ghost" size="icon" aria-label="Settings">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      )}

      <div className="flex items-center gap-6 p-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={profile.avatarUrl ?? undefined} />
          <AvatarFallback className="text-xl">{profile.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="flex flex-1 justify-around text-center">
          <div>
            <div className="font-semibold">{profile.postsCount}</div>
            <div className="text-xs text-muted-foreground">Posts</div>
          </div>
          <button onClick={() => setOpenConnections('followers')}>
            <div className="font-semibold">{profile.followersCount}</div>
            <div className="text-xs text-muted-foreground">Followers</div>
          </button>
          <button onClick={() => setOpenConnections('following')}>
            <div className="font-semibold">{profile.followingCount}</div>
            <div className="text-xs text-muted-foreground">Following</div>
          </button>
        </div>
      </div>

      <div className="px-4">
        <p className="font-semibold">{profile.username}</p>
        {profile.bio && <p className="text-sm">{profile.bio}</p>}
      </div>

      <div className="flex gap-2 p-4">
        {profile.isSelf ? (
          <>
            <Link href="/profile/edit" className="flex-1">
              <Button variant="outline" className="w-full">
                Edit Profile
              </Button>
            </Link>
            <Link href="/profile/requests">
              <Button variant="outline">Requests</Button>
            </Link>
          </>
        ) : profile.relationship === 'ACCEPTED' ? (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => unfollowMutation.mutate()}
            disabled={unfollowMutation.isPending}
          >
            Following
          </Button>
        ) : profile.relationship === 'PENDING' ? (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => unfollowMutation.mutate()}
            disabled={unfollowMutation.isPending}
          >
            Requested
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => followMutation.mutate()} disabled={followMutation.isPending}>
            Follow
          </Button>
        )}
        {!profile.isSelf && (
          <Link href={`/chat/${profile.username}`}>
            <Button variant="outline">Message</Button>
          </Link>
        )}
      </div>

      <div className="border-t" />

      {!profile.canViewPosts ? (
        <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
          <Lock className="h-8 w-8" />
          <p>This account is private.</p>
          <p>Follow to see their posts.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1 p-1">
            {posts.map((post) => {
              const media = post.media[0];
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setOpenPostId(post.id)}
                  aria-label={`Open ${profile.username}'s post`}
                  className="relative aspect-square overflow-hidden bg-muted"
                >
                  {media?.type === 'VIDEO' ? (
                    <video src={media.url} className="h-full w-full object-cover" />
                  ) : (
                    <img src={media?.url} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
          {posts.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No posts yet.</p>
          )}
          <div ref={loadMoreRef} className="h-10" />
          {isFetchingNextPage && <Spinner />}
        </>
      )}

      {openPostId && <PostModal postId={openPostId} onClose={() => setOpenPostId(null)} />}
      {openConnections && (
        <FollowListModal username={profile.username} type={openConnections} onClose={() => setOpenConnections(null)} />
      )}
    </div>
  );
}
