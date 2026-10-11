import { Injectable } from '@nestjs/common';

export type CallDirectionType = 'VIDEO' | 'AUDIO';
export type ActiveCallStatus = 'RINGING' | 'CONNECTED';

export interface ActiveCall {
  callId: string;
  callerId: string;
  calleeId: string;
  type: CallDirectionType;
  status: ActiveCallStatus;
  startedAt: Date;
}

@Injectable()
export class CallStateService {
  private callsById = new Map<string, ActiveCall>();
  private callIdByUser = new Map<string, string>();

  isBusy(userId: string): boolean {
    return this.callIdByUser.has(userId);
  }

  get(callId: string): ActiveCall | undefined {
    return this.callsById.get(callId);
  }

  getActiveCallForUser(userId: string): ActiveCall | undefined {
    const callId = this.callIdByUser.get(userId);
    return callId ? this.callsById.get(callId) : undefined;
  }

  startRinging(callId: string, callerId: string, calleeId: string, type: CallDirectionType): ActiveCall {
    const call: ActiveCall = { callId, callerId, calleeId, type, status: 'RINGING', startedAt: new Date() };
    this.callsById.set(callId, call);
    this.callIdByUser.set(callerId, callId);
    this.callIdByUser.set(calleeId, callId);
    return call;
  }

  connect(callId: string): void {
    const call = this.callsById.get(callId);
    if (call) call.status = 'CONNECTED';
  }

  /** Removes the call from active tracking and returns it, or undefined if it was already gone. */
  end(callId: string): ActiveCall | undefined {
    const call = this.callsById.get(callId);
    if (!call) return undefined;
    this.callsById.delete(callId);
    this.callIdByUser.delete(call.callerId);
    this.callIdByUser.delete(call.calleeId);
    return call;
  }

  otherParticipant(callId: string, userId: string): string | undefined {
    const call = this.callsById.get(callId);
    if (!call) return undefined;
    return call.callerId === userId ? call.calleeId : call.callerId;
  }
}
