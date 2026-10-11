import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        isPrivate: true,
        showActivityStatus: true,
      },
    });
  }

  update(
    id: string,
    data: { username?: string; bio?: string; avatarUrl?: string; isPrivate?: boolean; showActivityStatus?: boolean },
  ) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        bio: true,
        avatarUrl: true,
        isPrivate: true,
        showActivityStatus: true,
      },
    });
  }
  searchUsers(query: string) {
  if (!query || query.trim().length === 0) return [];

  return this.prisma.user.findMany({
    where: {
      username: { contains: query, mode: 'insensitive' },
    },
    select: { id: true, username: true, avatarUrl: true },
    take: 20,
  });
}

  async getProfile(viewerId: string, username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        isPrivate: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const isSelf = user.id === viewerId;

    const [followersCount, followingCount, postsCount, edge] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: user.id, status: 'ACCEPTED' } }),
      this.prisma.follow.count({ where: { followerId: user.id, status: 'ACCEPTED' } }),
      this.prisma.post.count({ where: { authorId: user.id } }),
      isSelf
        ? null
        : this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
          }),
    ]);

    const relationship = isSelf ? 'SELF' : (edge?.status ?? 'NOT_FOLLOWING');
    const canViewPosts = isSelf || relationship === 'ACCEPTED' || !user.isPrivate;

    return { ...user, followersCount, followingCount, postsCount, isSelf, relationship, canViewPosts };
  }

  async getUserPosts(viewerId: string, username: string, limit = 12, offset = 0) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, isPrivate: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.id !== viewerId && user.isPrivate) {
      const edge = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
      });
      if (edge?.status !== 'ACCEPTED') throw new ForbiddenException('This account is private');
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: user.id },
        skip: offset,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, media: { select: { url: true, type: true }, orderBy: { order: 'asc' } } },
      }),
      this.prisma.post.count({ where: { authorId: user.id } }),
    ]);

    const hasMore = offset + posts.length < total;
    return { posts, limit, offset, total, hasMore };
  }
}