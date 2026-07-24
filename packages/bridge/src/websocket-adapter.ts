import type { DevToolsTransportAdapter } from './adapter.js';

/**
 * WebSocketAdapter — wraps WebSocket communication as a DevToolsTransportAdapter.
 * 
 * Used for Vite dev server ↔ browser communication.
 * Includes auto-reconnect and message queueing.
 */
export class WebSocketAdapter implements DevToolsTransportAdapter {
  private ws: WebSocket | null = null;
  private messageQueue: unknown[] = [];
  private onMessageHandler: ((message: unknown) => void) | null = null;
  private onErrorHandler: ((error: Error) => void) | null = null;
  private shouldReconnect = false;

  constructor(
    private url: string,
    private reconnectDelay = 1000
  ) {
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        // Flush queued messages
        for (const msg of this.messageQueue) {
          this.ws?.send(JSON.stringify(msg));
        }
        this.messageQueue = [];
      };

      this.ws.onmessage = (event: MessageEvent) => {
        if (this.onMessageHandler) {
          try {
            const data = JSON.parse(event.data as string);
            this.onMessageHandler(data);
          } catch {
            this.onMessageHandler(event.data);
          }
        }
      };

      this.ws.onerror = () => {
        if (this.onErrorHandler) {
          this.onErrorHandler(new Error(`WebSocket error on ${this.url}`));
        }
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectDelay);
        }
      };
    } catch (e) {
      if (this.onErrorHandler) {
        this.onErrorHandler(e as Error);
      }
    }
  }

  send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.onMessageHandler = handler;
    return () => {
      this.onMessageHandler = null;
    };
  }

  onError(handler: (error: Error) => void): () => void {
    this.onErrorHandler = handler;
    return () => {
      this.onErrorHandler = null;
    };
  }

  close(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
    this.onMessageHandler = null;
    this.onErrorHandler = null;
  }

  /**
   * Get the current connection state.
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}
