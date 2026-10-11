import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private presenceService: PresenceService,
  ) {}

  private async resolveUser(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async assertParticipant(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    return conversation;
  }

  private otherParticipantId(conversation: { user1Id: string; user2Id: string }, meId: string) {
    return conversation.user1Id === meId ? conversation.user2Id : conversation.user1Id;
  }

  async getOtherParticipantId(meId: string, conversationId: string) {
    const conversation = await this.assertParticipant(meId, conversationId);
    return this.otherParticipantId(conversation, meId);
  }

  async getConversationPartnerIds(userId: string): Promise<string[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      select: { user1Id: true, user2Id: true },
    });
    return conversations.map((c) => this.otherParticipantId(c, userId));
  }

  async getOrCreateConversation(meId: string, otherUsername: string) {
    const other = await this.resolveUser(otherUsername);
    if (other.id === meId) throw new ForbiddenException("You can't message yourself");

    const [user1Id, user2Id] = [meId, other.id].sort();

    const existing = await this.prisma.conversation.findUnique({
      where: { user1Id_user2Id: { user1Id, user2Id } },
    });
    const conversation =
      existing ??
      (await this.prisma.conversation.create({ data: { user1Id, user2Id } }));

    return { id: conversation.id, otherUser: { ...other, online: this.presenceService.isOnline(other.id) } };
  }

  async listConversations(meId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ user1Id: meId }, { user2Id: meId }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        user1: { select: { id: true, username: true, avatarUrl: true } },
        user2: { select: { id: true, username: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: { where: { senderId: { not: meId }, read: false } } } },
      },
    });

    return conversations.map((c) => {
      const otherUser = c.user1Id === meId ? c.user2 : c.user1;
      return {
        id: c.id,
        otherUser: { ...otherUser, online: this.presenceService.isOnline(otherUser.id) },
        lastMessage: c.messages[0] ?? null,
        unreadCount: c._count.messages,
        updatedAt: c.updatedAt,
      };
    });
  }

  // Kept alongside plain text so a shared-post message renders its preview card the same way
  // whether it just arrived over the socket or came back from the paginated history fetch.
  private readonly sharedPostInclude = {
    sharedPost: {
      select: {
        id: true,
        caption: true,
        media: { take: 1, orderBy: { order: 'asc' as const } },
        author: { select: { username: true, avatarUrl: true } },
      },
    },
  };

  async listMessages(meId: string, conversationId: string, limit = 30, offset = 0) {
    await this.assertParticipant(meId, conversationId);

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
        include: this.sharedPostInclude,
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    const hasMore = offset + messages.length < total;
    return { messages: messages.reverse(), limit, offset, total, hasMore };
  }

  async sendMessage(meId: string, conversationId: string, text: string, sharedPostId?: string) {
    const conversation = await this.assertParticipant(meId, conversationId);
    const trimmed = text.trim();
    if (!trimmed && !sharedPostId) throw new ForbiddenException('Message cannot be empty');

    const [message] = await Promise.all([
      this.prisma.message.create({
        data: { conversationId, senderId: meId, text: trimmed, sharedPostId },
        include: { sender: { select: { username: true, avatarUrl: true } }, ...this.sharedPostInclude },
      }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]);

    return { message, recipientId: this.otherParticipantId(conversation, meId) };
  }

  async markRead(meId: string, conversationId: string) {
    const conversation = await this.assertParticipant(meId, conversationId);
    const { count } = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: meId }, read: false },
      data: { read: true },
    });
    return { status: 'ok', markedCount: count, otherUserId: this.otherParticipantId(conversation, meId) };
  }

  async unreadCount(meId: string) {
    const count = await this.prisma.message.count({
      where: { read: false, senderId: { not: meId }, conversation: { OR: [{ user1Id: meId }, { user2Id: meId }] } },
    });
    return { count };
  }
}
