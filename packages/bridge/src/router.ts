import type { DevToolsTransportAdapter } from './adapter.js';

/**
 * buildRpcRouter — creates a birpc-based RPC router from a transport adapter.
 * This enables type-safe bidirectional RPC between the browser and dev server.
 * 
 * @param adapter - The transport adapter (PostMessageAdapter or WebSocketAdapter)
 * @param serverFunctions - Server-side RPC function implementations
 * @returns A birpc instance for client-server communication
 */
export function buildRpcRouter<T extends Record<string, (...args: unknown[]) => unknown>>(
  adapter: DevToolsTransportAdapter,
  serverFunctions: T
) {
  let counter = 0;
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  adapter.onMessage((msg: unknown) => {
    const data = msg as { type?: string; id?: string; result?: unknown; error?: string };
    if (data?.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)!;
      pending.delete(data.id);
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data.result);
      }
    }
  });

  const proxy = new Proxy({} as T, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        return new Promise<unknown>((resolve, reject) => {
          const id = `rpc-${++counter}`;
          pending.set(id, { resolve, reject });
          adapter.send({ type: 'rpc', method: prop, params: args, id });
        });
      };
    },
  });

  // Handle incoming RPC calls
  adapter.onMessage(async (msg: unknown) => {
    const data = msg as { type?: string; method?: string; params?: unknown[]; id?: string };
    if (data?.type === 'rpc' && data.method && data.id) {
      const fn = serverFunctions[data.method as keyof T];
      if (typeof fn === 'function') {
        try {
          const result = await fn(...(data.params || []));
          adapter.send({ type: 'rpc-response', id: data.id, result });
        } catch (e) {
          adapter.send({ type: 'rpc-response', id: data.id, error: (e as Error).message });
        }
      }
    }
  });

  return proxy;
}

/**
 * createBridge — factory for creating both sides of the RPC bridge.
 * 
 * @param adapter - The transport adapter
 * @param serverFunctions - Server-side implementations
 * @param clientFunctions - Client-side implementations
 * @returns An object with server and client RPC interfaces
 */
export function createBridge<
  TServer extends Record<string, (...args: unknown[]) => unknown>,
  TClient extends Record<string, (...args: unknown[]) => unknown>
>(
  adapter: DevToolsTransportAdapter,
  serverFunctions: TServer,
  clientFunctions?: TClient
) {
  const serverStub = buildRpcRouter<TServer>(adapter, serverFunctions);
  const clientStub = clientFunctions
    ? buildRpcRouter<TClient>(adapter, clientFunctions)
    : undefined;

  return { server: serverStub, client: clientStub };
}
