/**
 * @svelte-devtools/bridge — abstract RPC transport layer
 * 
 * Provides a type-safe bidirectional communication layer between
 * the browser runtime and the Vite dev server.
 * 
 * Supports both postMessage (browser iframe) and WebSocket (dev server) transports.
 * Uses birpc for RPC stub generation.
 */

export type { DevToolsTransportAdapter } from './adapter.js';
export { PostMessageAdapter } from './post-message-adapter.js';
export { WebSocketAdapter } from './websocket-adapter.js';
export { buildRpcRouter, createBridge } from './router.js';
