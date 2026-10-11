import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallDirectionType } from './call-state.service';

type CallResolution = 'COMPLETED' | 'REJECTED' | 'MISSED';

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  getPublicUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true },
    });
  }

  recordCall(params: {
    callerId: string;
    calleeId: string;
    type: CallDirectionType;
    status: CallResolution;
    startedAt: Date;
  }) {
    return this.prisma.call.create({
      data: {
        callerId: params.callerId,
        calleeId: params.calleeId,
        type: params.type,
        status: params.status,
        startedAt: params.startedAt,
        endedAt: new Date(),
      },
    });
  }
}
