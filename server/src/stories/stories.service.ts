import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoryDto } from './dto/create-story.dto';

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  create(userId: string, dto: CreateStoryDto) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return this.prisma.story.create({
      data: {
        authorId: userId,
        url: dto.url,
        publicId: dto.publicId,
        type: dto.type as any,
        expiresAt,
      },
    });
  }

  async getActiveStories(viewerId: string) {
    const stories = await this.prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        views: { where: { viewerId }, select: { id: true } },
      },
      
    });

    

    const grouped = new Map<string, { author: any; storyIds: string[]; allSeen: boolean }>();

    for (const story of stories) {
      const seen = story.views.length > 0;
      if (!grouped.has(story.authorId)) {
        grouped.set(story.authorId, { author: story.author, storyIds: [], allSeen: true });
      }
      const group = grouped.get(story.authorId)!;
      group.storyIds.push(story.id);
      if (!seen) group.allSeen = false;
    }

    return Array.from(grouped.values());
  }
  getStoriesByAuthor(authorId: string) {
  return this.prisma.story.findMany({
    where: { authorId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, url: true, type: true, createdAt: true },
  });
}

markViewed(viewerId: string, storyId: string) {
  return this.prisma.storyView.upsert({
    where: { storyId_viewerId: { storyId, viewerId } },
    create: { storyId, viewerId },
    update: {},
  });
}

  // Only the story's own author can ever see who viewed it - same privacy rule every
  // real stories feature follows (you never learn who viewed someone else's story).
  async getViewers(userId: string, storyId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { authorId: true } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId !== userId) throw new ForbiddenException("You can only see viewers of your own stories");

    return this.prisma.storyView.findMany({
      // Exclude the author's own view - opening your own story to check its viewers
      // shouldn't make you show up in that same list.
      where: { storyId, viewerId: { not: userId } },
      orderBy: { viewedAt: 'desc' },
      select: {
        viewedAt: true,
        viewer: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  }
}