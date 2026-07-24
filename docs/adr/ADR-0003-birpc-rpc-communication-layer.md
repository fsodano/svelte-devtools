# ADR-0003: Birpc-Based RPC Communication Layer

## Status
Accepted

## Context
The runtime communicates with the DevTools client exclusively through raw `postMessage` events. This works for client-facing features (component tree display, state inspection, timeline events) but breaks down when the DevTools needs to perform server-side actions.

File opening, directory listing, route parsing, and source code lookups all require access to the Vite dev server process. The runtime lives in the browser and has no direct path to the server filesystem. The client has `import.meta.hot`, which exposes a WebSocket connection, but it is untyped and awkward to use for request-response patterns.

`postMessage` is fundamentally unidirectional: the client can send data to the iframe, and the iframe can send data back, but neither side can reach the Vite server directly. The `import.meta.hot` WebSocket can reach the server, but every call requires manually serializing JSON, matching request IDs to callbacks, and handling timeouts inline. This pattern repeated across three features already leads to duplicated boilerplate.

A unified transport layer is needed that:

- Provides bidirectional RPC between any two endpoints (iframe to runtime, runtime to server, client to server)
- Presents a typed interface so the caller does not worry about serialization
- Supports pluggable transports (postMessage for in-browser, WebSocket for server)
- Handles request-response correlation, error propagation, and timeouts

## Decision
Create a new `packages/bridge/` package built on top of `birpc` (https://github.com/antfu/birpc). The package exports two key abstractions:

1. **`DevToolsTransportAdapter`** interface — a minimal transport contract:

   ```typescript
   interface DevToolsTransportAdapter {
     send(data: unknown): void;
     onMessage(handler: (data: unknown) => void): void;
     onError(handler: (error: Error) => void): void;
     close(): void;
   }
   ```

2. **`buildRpcRouter()`** — a factory that wraps a `DevToolsTransportAdapter` with birpc to produce a typed RPC router. The router exposes a `server` object (methods the remote peer can call) and a `client` proxy (typed stub for calling methods on the remote peer).

Two concrete adapters ship with the package:

   - **`PostMessageAdapter`** — wraps `window.postMessage` / `message` event for communication between the runtime and the DevTools iframe (or the DevTools popup window). Uses `origin` filtering and structured clone serialization.

   - **`WebSocketAdapter`** — wraps a `WebSocket` connection (or the Vite HMR WebSocket via `import.meta.hot`) for communication between the client and the Vite dev server.

The RPC procedures for server-side operations live in a shared `rpc-procedures.ts` file:

- `server.openFile(path: string): void` — opens a file in the editor
- `server.listDirectory(path: string): FileEntry[]` — lists files in a directory
- `server.parseRoutes(): RouteDefinition[]` — parses SvelteKit routes from the filesystem
- `server.getSourceMap(file: string): SourceMap | null` — retrieves the source map for a compiled file
- `server.getProjectConfig(): ProjectConfig` — returns project-level configuration

## Consequences
- Transport logic is cleanly separated from RPC procedure definitions. Adding a new transport (e.g., `MessageChannelAdapter` for worker threads) requires only a new adapter class.
- Both the postMessage path (iframe-to-runtime) and the WebSocket path (client-to-server) work through the same typed interface. The caller imports `buildRpcRouter`, passes the appropriate adapter, and gets a fully typed `client` proxy.
- birpc provides automatic request-response correlation, timeout handling, and error propagation. No manual `requestId` tracking or callback maps needed.
- Adds one new package dependency (`birpc`) to the monorepo. The `birpc` package is lightweight (~1KB) and maintained by the Vite ecosystem.
- The `DevToolsTransportAdapter` interface makes testing straightforward: tests can pass a mock adapter that captures sent messages and injects fake incoming messages without setting up real postMessage or WebSocket connections.
- Server-side RPC procedures are centralized in a single file, making them auditable and easy to extend.
- The bridge package becomes a natural place for shared serialization utilities (e.g., `encodeTransferable` for large payloads).
