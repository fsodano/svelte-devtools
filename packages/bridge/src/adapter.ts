/**
 * Transport adapter interface.
 * Implementations: PostMessageAdapter, WebSocketAdapter.
 */
export interface DevToolsTransportAdapter {
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  close(): void;
}
