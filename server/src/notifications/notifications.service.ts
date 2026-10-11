import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, limit = 20, offset = 0) {
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
        include: {
          actor: { select: { id: true, username: true, avatarUrl: true } },
          post: {
            select: {
              id: true,
              media: { select: { url: true, type: true }, orderBy: { order: 'asc' }, take: 1 },
            },
          },
        },
      }),
      this.prisma.notification.count({ where: { recipientId: userId } }),
    ]);

    const hasMore = offset + notifications.length < total;
    return { notifications, limit, offset, total, hasMore };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { recipientId: userId, read: false } });
    return { count };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
    return { status: 'ok' };
  }
}
