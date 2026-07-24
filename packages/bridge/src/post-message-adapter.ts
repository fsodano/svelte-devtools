import type { DevToolsTransportAdapter } from './adapter.js';

/**
 * PostMessageAdapter — wraps window.postMessage communication
 * as a DevToolsTransportAdapter.
 * 
 * Used for browser iframe ↔ runtime communication.
 */
export class PostMessageAdapter implements DevToolsTransportAdapter {
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private errorHandler: ((err: Error) => void) | null = null;

  constructor(
    private targetWindow: Window = window.parent,
    private targetOrigin: string = '*'
  ) {}

  send(message: unknown): void {
    try {
      this.targetWindow.postMessage(
        { source: 'svelte-devtools', payload: message },
        this.targetOrigin
      );
    } catch (e) {
      if (this.errorHandler) {
        this.errorHandler(e as Error);
      }
    }
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.messageHandler = (event: MessageEvent) => {
      if (event.data?.source !== 'svelte-devtools') return;
      handler(event.data.payload);
    };
    window.addEventListener('message', this.messageHandler);
    return () => {
      if (this.messageHandler) {
        window.removeEventListener('message', this.messageHandler);
        this.messageHandler = null;
      }
    };
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandler = handler;
    return () => {
      this.errorHandler = null;
    };
  }

  close(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.errorHandler = null;
  }
}
