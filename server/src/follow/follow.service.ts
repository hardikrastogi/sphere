import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowService {
  constructor(private prisma: PrismaService) {}

  private async resolveTarget(username: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true, isPrivate: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Same rule as viewing someone's posts: a private account's connections are only
   * visible to the account itself or an accepted follower. */
  private async assertCanViewConnections(viewerId: string, target: { id: string; isPrivate: boolean }) {
    if (viewerId === target.id || !target.isPrivate) return;
    const edge = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: target.id } },
    });
    if (edge?.status !== 'ACCEPTED') throw new ForbiddenException('This account is private');
  }

  async listFollowers(viewerId: string, username: string) {
    const target = await this.resolveTarget(username);
    await this.assertCanViewConnections(viewerId, target);

    const rows = await this.prisma.follow.findMany({
      where: { followingId: target.id, status: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
      select: { follower: { select: { id: true, username: true, avatarUrl: true } } },
    });
    return rows.map((r) => r.follower);
  }

  async listFollowing(viewerId: string, username: string) {
    const target = await this.resolveTarget(username);
    await this.assertCanViewConnections(viewerId, target);

    const rows = await this.prisma.follow.findMany({
      where: { followerId: target.id, status: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
      select: { following: { select: { id: true, username: true, avatarUrl: true } } },
    });
    return rows.map((r) => r.following);
  }

  async sendRequest(meId: string, username: string) {
    const target = await this.resolveTarget(username);
    if (target.id === meId) throw new BadRequestException("You can't follow yourself");

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: meId, followingId: target.id } },
    });
    if (existing) return existing;

    // Public accounts don't need approval - following them is immediate, same as Instagram.
    if (!target.isPrivate) {
      return this.prisma.follow.create({
        data: { followerId: meId, followingId: target.id, status: 'ACCEPTED' },
      });
    }

    const follow = await this.prisma.follow.create({
      data: { followerId: meId, followingId: target.id, status: 'PENDING' },
    });

    await this.prisma.notification.create({
      data: { recipientId: target.id, actorId: meId, type: 'FOLLOW_REQUEST' },
    });

    return follow;
  }

  async removeFollow(meId: string, username: string) {
    const target = await this.resolveTarget(username);
    await this.prisma.follow.deleteMany({
      where: { followerId: meId, followingId: target.id },
    });
    await this.prisma.notification.deleteMany({
      where: { recipientId: target.id, actorId: meId, type: 'FOLLOW_REQUEST' },
    });
    return { status: 'NOT_FOLLOWING' };
  }

  listPendingRequests(meId: string) {
    return this.prisma.follow.findMany({
      where: { followingId: meId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        follower: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  }

  async acceptRequest(meId: string, requestId: string) {
    const request = await this.prisma.follow.findUnique({ where: { id: requestId } });
    if (!request || request.followingId !== meId || request.status !== 'PENDING') {
      throw new NotFoundException('Follow request not found');
    }
    return this.applyAccept(request);
  }

  async acceptRequestFrom(meId: string, followerUsername: string) {
    const follower = await this.resolveTarget(followerUsername);
    const request = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: follower.id, followingId: meId } },
    });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('Follow request not found');
    }
    return this.applyAccept(request);
  }

  async rejectRequest(meId: string, requestId: string) {
    const request = await this.prisma.follow.findUnique({ where: { id: requestId } });
    if (!request || request.followingId !== meId || request.status !== 'PENDING') {
      throw new NotFoundException('Follow request not found');
    }
    return this.applyReject(request);
  }

  async rejectRequestFrom(meId: string, followerUsername: string) {
    const follower = await this.resolveTarget(followerUsername);
    const request = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: follower.id, followingId: meId } },
    });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('Follow request not found');
    }
    return this.applyReject(request);
  }

  private async applyAccept(request: { id: string; followerId: string; followingId: string }) {
    const updated = await this.prisma.follow.update({ where: { id: request.id }, data: { status: 'ACCEPTED' } });

    await this.prisma.notification.deleteMany({
      where: { recipientId: request.followingId, actorId: request.followerId, type: 'FOLLOW_REQUEST' },
    });
    await this.prisma.notification.create({
      data: { recipientId: request.followerId, actorId: request.followingId, type: 'FOLLOW_ACCEPTED' },
    });

    return updated;
  }

  private async applyReject(request: { id: string; followerId: string; followingId: string }) {
    await this.prisma.follow.delete({ where: { id: request.id } });
    await this.prisma.notification.deleteMany({
      where: { recipientId: request.followingId, actorId: request.followerId, type: 'FOLLOW_REQUEST' },
    });
    return { status: 'REJECTED' };
  }
}
