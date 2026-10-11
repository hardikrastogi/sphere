import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  private onlineUsers = new Map<string, Set<string>>();

  /** Returns true if this connection just brought the user online (they had no other open sockets). */
  addConnection(userId: string, socketId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.add(socketId);
      return false;
    }
    this.onlineUsers.set(userId, new Set([socketId]));
    return true;
  }

  /** Returns true if this was the user's last open socket, i.e. they just went offline. */
  removeConnection(userId: string, socketId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.onlineUsers.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }
}
