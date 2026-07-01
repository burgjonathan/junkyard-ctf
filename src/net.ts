import type { ClientMessage, ServerMessage } from '../shared/types.ts';

export type NetHandler = (msg: ServerMessage) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<NetHandler>();
  private closeHandlers = new Set<() => void>();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Failed to connect to server'));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as ServerMessage;
          for (const h of this.handlers) h(msg);
        } catch { /* malformed — ignore */ }
      };
      ws.onclose = () => {
        for (const h of this.closeHandlers) h();
      };
    });
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(cb: NetHandler): void { this.handlers.add(cb); }
  onClose(cb: () => void): void { this.closeHandlers.add(cb); }
}
