import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private async getAcceptedFollowingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId, status: 'ACCEPTED' },
      select: { followingId: true },
    });
    return rows.map((r) => r.followingId);
  }

  /** A post is visible to a viewer if they wrote it, its author is public, or they're an accepted follower. */
  private async canViewPost(viewerId: string, authorId: string, authorIsPrivate: boolean): Promise<boolean> {
    if (viewerId === authorId || !authorIsPrivate) return true;
    const edge = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: authorId } },
    });
    return edge?.status === 'ACCEPTED';
  }

  /** Only the first page is worth caching - it's the one every load/refresh actually hits. */
  private async withFirstPageCache<T>(cacheKey: string | null, compute: () => Promise<T>): Promise<T> {
    if (cacheKey) {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const result = await compute();

    if (cacheKey) {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', 30);
    }

    return result;
  }

  async create(userId: string, dto: CreatePostDto) {
    const post = await this.prisma.post.create({
      data: {
        caption: dto.caption,
        authorId: userId,
        media: {
          create: dto.media.map((m, index) => ({
            url: m.url,
            publicId: m.publicId,
            type: m.type as any,
            order: index,
          })),
        },
      },
      include: { media: true },
    });

    // So the poster sees their own new post immediately instead of waiting out the cache TTL.
    const keys = await this.redis.client.keys(`feed:${userId}:first:*`);
    if (keys.length) await this.redis.client.del(...keys);

    return post;
  }

  async getFeed(userId: string, limit = 10, offset = 0) {
    const cacheKey = offset === 0 ? `feed:${userId}:first:${limit}` : null;

    return this.withFirstPageCache(cacheKey, async () => {
      const followingIds = await this.getAcceptedFollowingIds(userId);
      const where = {
        OR: [{ authorId: userId }, { author: { isPrivate: false } }, { authorId: { in: followingIds } }],
      };

      const [posts, total] = await Promise.all([
        this.prisma.post.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            media: true,
            author: { select: { username: true, avatarUrl: true } },
            likes: { where: { userId }, select: { id: true } },
            _count: { select: { likes: true } },
          },
        }),
        this.prisma.post.count({ where }),
      ]);

      const hasMore = offset + posts.length < total;
      return { posts, limit, offset, total, hasMore };
    });
  }

  async getExploreFeed(userId: string, limit = 10, offset = 0) {
    const cacheKey = offset === 0 ? `explore:${userId}:first:${limit}` : null;

    return this.withFirstPageCache(cacheKey, async () => {
      const followingIds = await this.getAcceptedFollowingIds(userId);
      const where = {
        authorId: { not: userId },
        OR: [{ author: { isPrivate: false } }, { authorId: { in: followingIds } }],
      };

      const [posts, total] = await Promise.all([
        this.prisma.post.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            media: true,
            author: { select: { username: true, avatarUrl: true } },
            likes: { where: { userId }, select: { id: true } },
            _count: { select: { likes: true } },
          },
        }),
        this.prisma.post.count({ where }),
      ]);

      const hasMore = offset + posts.length < total;
      return { posts, limit, offset, total, hasMore };
    });
  }

  async getPostById(userId: string, postId: string) {
    const gate = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!(await this.canViewPost(userId, gate.authorId, gate.author.isPrivate))) {
      throw new ForbiddenException('This account is private');
    }

    return this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: {
        media: true,
        author: { select: { username: true, avatarUrl: true } },
        likes: { where: { userId }, select: { id: true } },
        _count: { select: { likes: true } },
      },
    });
  }

  async likePost(userId: string, postId: string) {
    const existing = await this.prisma.like.findUnique({ where: { userId_postId: { userId, postId } } });
    if (existing) return existing;

    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!(await this.canViewPost(userId, post.authorId, post.author.isPrivate))) {
      throw new ForbiddenException('This account is private');
    }

    const like = await this.prisma.like.create({ data: { userId, postId } });

    if (post.authorId !== userId) {
      await this.prisma.notification.create({
        data: { recipientId: post.authorId, actorId: userId, type: 'LIKE', postId },
      });
    }

    return like;
  }

  unlikePost(userId: string, postId: string) {
    return this.prisma.like.deleteMany({
      where: { userId, postId },
    });
  }

  async addComment(userId: string, postId: string, text: string) {
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!(await this.canViewPost(userId, post.authorId, post.author.isPrivate))) {
      throw new ForbiddenException('This account is private');
    }

    const comment = await this.prisma.comment.create({
      data: { userId, postId, text },
      include: { user: { select: { username: true, avatarUrl: true } } },
    });

    if (post.authorId !== userId) {
      await this.prisma.notification.create({
        data: { recipientId: post.authorId, actorId: userId, type: 'COMMENT', postId },
      });
    }

    return comment;
  }

  async getComments(userId: string, postId: string) {
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!(await this.canViewPost(userId, post.authorId, post.author.isPrivate))) {
      throw new ForbiddenException('This account is private');
    }

    return this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { username: true, avatarUrl: true } } },
    });
  }
}