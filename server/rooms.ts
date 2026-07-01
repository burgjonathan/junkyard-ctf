import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import { Room } from './room.ts';

export class RoomManager {
  private rooms = new Map<string, Room>();

  attach(ws: WebSocket): void {
    let bound: { room: Room; playerId: string } | null = null;

    ws.on('message', (data) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(data.toString()) as ClientMessage; } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'createRoom') {
        if (bound) return;
        const code = this.newCode();
        const room = new Room(code, () => this.rooms.delete(code));
        this.rooms.set(code, room);
        const playerId = room.addPlayer(ws);
        if (playerId) bound = { room, playerId };
      } else if (msg.type === 'joinRoom') {
        if (bound) return;
        const room = this.rooms.get(msg.roomCode.toUpperCase());
        if (!room) { sendError(ws, `Room ${msg.roomCode} not found`); return; }
        const playerId = room.addPlayer(ws);
        if (!playerId) { sendError(ws, 'Room full'); return; }
        bound = { room, playerId };
      } else if (msg.type === 'command') {
        if (!bound) return;
        bound.room.handleMessage(bound.playerId, msg);
      }
    });

    ws.on('close', () => {
      if (bound) bound.room.removePlayer(bound.playerId);
      bound = null;
    });
    ws.on('error', () => {
      if (bound) bound.room.removePlayer(bound.playerId);
      bound = null;
    });
  }

  private newCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      if (!this.rooms.has(code)) return code;
    }
    // Extremely unlikely fallback
    return 'Z' + Date.now().toString(36).slice(-3).toUpperCase();
  }
}

function sendError(ws: WebSocket, message: string): void {
  const m: ServerMessage = { type: 'error', message };
  ws.send(JSON.stringify(m));
}
