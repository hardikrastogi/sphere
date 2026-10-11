import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PresenceService } from './presence.service';
import { CallsService } from '../calls/calls.service';
import { CallStateService, CallDirectionType } from '../calls/call-state.service';
import { PrismaService } from '../prisma/prisma.service';

function extractTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('token='));
  return match ? decodeURIComponent(match.slice('token='.length)) : null;
}

@WebSocketGateway({
  // .trim() guards against a stray trailing newline/space in the dashboard-set env var.
  cors: { origin: process.env.CLIENT_URL?.trim() || 'http://localhost:3000', credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
    private presenceService: PresenceService,
    private callsService: CallsService,
    private callState: CallStateService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = extractTokenFromCookie(client.handshake.headers.cookie);
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      client.data.userId = userId;
      client.join(`user:${userId}`);

      const cameOnline = this.presenceService.addConnection(userId, client.id);
      if (cameOnline) {
        const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { showActivityStatus: true } });
        if (me?.showActivityStatus) {
          const partnerIds = await this.chatService.getConversationPartnerIds(userId);
          if (partnerIds.length) {
            this.server.to(partnerIds.map((id) => `user:${id}`)).emit('user_online', { userId });
          }
        }
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    const activeCall = this.callState.getActiveCallForUser(userId);
    if (activeCall) {
      this.callState.end(activeCall.callId);
      const otherId = activeCall.callerId === userId ? activeCall.calleeId : activeCall.callerId;
      this.server.to(`user:${otherId}`).emit('call_end', { callId: activeCall.callId });
      try {
        await this.callsService.recordCall({
          callerId: activeCall.callerId,
          calleeId: activeCall.calleeId,
          type: activeCall.type,
          status: activeCall.status === 'CONNECTED' ? 'COMPLETED' : 'MISSED',
          startedAt: activeCall.startedAt,
        });
      } catch {
        // Best-effort history write - never let this crash the process.
      }
    }

    const wentOffline = this.presenceService.removeConnection(userId, client.id);
    if (wentOffline) {
      try {
        const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { showActivityStatus: true } });
        if (me?.showActivityStatus) {
          const partnerIds = await this.chatService.getConversationPartnerIds(userId);
          if (partnerIds.length) {
            this.server.to(partnerIds.map((id) => `user:${id}`)).emit('user_offline', { userId });
          }
        }
      } catch {
        // Best-effort broadcast - a DB hiccup here should never take down the whole server.
      }
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; text: string; sharedPostId?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const { message, recipientId } = await this.chatService.sendMessage(
        userId,
        body.conversationId,
        body.text,
        body.sharedPostId,
      );
      this.server.to(`user:${recipientId}`).to(`user:${userId}`).emit('new_message', message);
    } catch (err: any) {
      client.emit('send_message_error', { message: err?.message ?? 'Failed to send message' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data.userId;
    if (!userId) return;
    try {
      const recipientId = await this.chatService.getOtherParticipantId(userId, body.conversationId);
      this.server.to(`user:${recipientId}`).emit('typing', { conversationId: body.conversationId, userId });
    } catch {
      // not a participant in this conversation - silently ignore
    }
  }

  @SubscribeMessage('stop_typing')
  async handleStopTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data.userId;
    if (!userId) return;
    try {
      const recipientId = await this.chatService.getOtherParticipantId(userId, body.conversationId);
      this.server.to(`user:${recipientId}`).emit('stop_typing', { conversationId: body.conversationId, userId });
    } catch {
      // not a participant in this conversation - silently ignore
    }
  }

  notifyRead(conversationId: string, notifyUserId: string) {
    this.server.to(`user:${notifyUserId}`).emit('messages_read', { conversationId });
  }

  @SubscribeMessage('call_invite')
  async handleCallInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId: string; calleeId: string; type: CallDirectionType; offer: unknown },
  ) {
    const callerId = client.data.userId;
    if (!callerId || body.calleeId === callerId) return;

    if (!this.presenceService.isOnline(body.calleeId)) {
      client.emit('call_unavailable', { callId: body.callId });
      return;
    }
    if (this.callState.isBusy(body.calleeId) || this.callState.isBusy(callerId)) {
      client.emit('call_busy', { callId: body.callId });
      return;
    }

    this.callState.startRinging(body.callId, callerId, body.calleeId, body.type);

    const caller = await this.callsService.getPublicUser(callerId);
    this.server.to(`user:${body.calleeId}`).emit('call_invite', {
      callId: body.callId,
      type: body.type,
      offer: body.offer,
      caller,
    });
  }

  @SubscribeMessage('call_answer')
  handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string; answer: unknown }) {
    const userId = client.data.userId;
    if (!userId) return;
    const call = this.callState.get(body.callId);
    if (!call || call.calleeId !== userId || call.status !== 'RINGING') return;

    this.callState.connect(body.callId);
    this.server.to(`user:${call.callerId}`).emit('call_answer', { callId: body.callId, answer: body.answer });
    // Also tell any other open tabs/devices of the answering user to stop ringing.
    this.server.to(`user:${call.calleeId}`).emit('call_ring_stop', { callId: body.callId });
  }

  @SubscribeMessage('ice_candidate')
  handleIceCandidate(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string; candidate: unknown }) {
    const userId = client.data.userId;
    if (!userId) return;
    const otherId = this.callState.otherParticipant(body.callId, userId);
    if (!otherId) return;
    this.server.to(`user:${otherId}`).emit('ice_candidate', { callId: body.callId, candidate: body.candidate });
  }

  @SubscribeMessage('call_reject')
  async handleCallReject(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string }) {
    const userId = client.data.userId;
    if (!userId) return;
    const call = this.callState.get(body.callId);
    if (!call || call.calleeId !== userId || call.status !== 'RINGING') return;

    this.callState.end(body.callId);
    this.server.to(`user:${call.callerId}`).emit('call_reject', { callId: body.callId });
    // Also tell any other open tabs/devices of the declining user to stop ringing.
    this.server.to(`user:${call.calleeId}`).emit('call_ring_stop', { callId: body.callId });

    try {
      await this.callsService.recordCall({
        callerId: call.callerId,
        calleeId: call.calleeId,
        type: call.type,
        status: 'REJECTED',
        startedAt: call.startedAt,
      });
    } catch {
      // Best-effort history write - never let this break the live call flow.
    }
  }

  @SubscribeMessage('call_timeout')
  async handleCallTimeout(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string }) {
    const userId = client.data.userId;
    if (!userId) return;
    const call = this.callState.get(body.callId);
    if (!call || call.callerId !== userId || call.status !== 'RINGING') return;

    this.callState.end(body.callId);
    this.server.to(`user:${call.calleeId}`).emit('call_timeout', { callId: body.callId });

    try {
      await this.callsService.recordCall({
        callerId: call.callerId,
        calleeId: call.calleeId,
        type: call.type,
        status: 'MISSED',
        startedAt: call.startedAt,
      });
    } catch {
      // Best-effort history write - never let this break the live call flow.
    }
  }

  @SubscribeMessage('call_end')
  async handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string }) {
    const userId = client.data.userId;
    if (!userId) return;
    const call = this.callState.get(body.callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) return;

    this.callState.end(body.callId);
    const otherId = call.callerId === userId ? call.calleeId : call.callerId;
    this.server.to(`user:${otherId}`).emit('call_end', { callId: body.callId });

    try {
      await this.callsService.recordCall({
        callerId: call.callerId,
        calleeId: call.calleeId,
        type: call.type,
        status: call.status === 'CONNECTED' ? 'COMPLETED' : 'MISSED',
        startedAt: call.startedAt,
      });
    } catch {
      // Best-effort history write - never let this break the live call flow.
    }
  }
}
