import type { Plugin } from 'vite';
import type { PluginAPI } from '../types.js';
import { DOCK_CONFIG, RPC_METHODS, RPC_TYPES } from '@svelte-devtools/types';
import type { ViteDevToolsNodeContext } from '@vitejs/devtools-kit';
import path from 'path';

export function devtoolsSetup(api: PluginAPI): Plugin & { devtools: { setup: (ctx: ViteDevToolsNodeContext) => void } } {
  return {
    name: 'svelte-devtools:devtools-setup',
    apply: 'serve',

    devtools: {
      setup(ctx: ViteDevToolsNodeContext) {
        // Register the dock entry
        ctx.docks.register({
          id: DOCK_CONFIG.ID,
          title: DOCK_CONFIG.TITLE,
          icon: DOCK_CONFIG.ICON,
          type: DOCK_CONFIG.TYPE,
          url: DOCK_CONFIG.URL,
        });

        // Register RPC: get-components
        ctx.rpc.register({
          name: RPC_METHODS.GET_COMPONENTS,
          type: RPC_TYPES.QUERY,
          handler: async () => {
            return Array.from(api.componentRegistry.values());
          },
        });

        // Register RPC: open-in-editor — delegates to @sveltejs/vite-plugin-svelte's native endpoint
        ctx.rpc.register({
          name: RPC_METHODS.OPEN_IN_EDITOR,
          type: RPC_TYPES.MUTATION,
          handler: async (data: unknown) => {
            const { file, line } = data as { file: string; line?: number };
            const fullPath = path.resolve(api.root, file);
            const port = api.config?.server?.port || 5173;
            const targetUrl = `/__open-in-editor?file=${encodeURIComponent(fullPath)}${line ? `:${line}` : ''}`;
            try {
              const res = await fetch(`http://localhost:${port}${targetUrl}`);
              return res.ok;
            } catch {
              return false;
            }
          },
        });

        // Register RPC: migration-score
        ctx.rpc.register({
          name: RPC_METHODS.MIGRATION_SCORE,
          type: RPC_TYPES.QUERY,
          handler: async () => {
            const results = Array.from(api.componentRegistry.values())
              .filter(m => m.migrationResult)
              .map(m => m.migrationResult!);
            const total = results.length;
            const avgScore = total > 0
              ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total)
              : 100;
            return { overall: avgScore, totalFiles: total, perFile: results };
          },
        });

        // Register RPC: build-status
        ctx.rpc.register({
          name: RPC_METHODS.BUILD_STATUS,
          type: RPC_TYPES.QUERY,
          handler: async () => ({
            ok: true,
            data: {
              connected: true,
              totalComponents: api.componentRegistry.size,
              activeComponents: api.componentRegistry.size,
              trackedRunes: ['$state', '$derived', '$props', '$effect', '$effect.pre', '$bindable', 'untrack', '$host'],
              errors: [],
              warnings: [],
            },
            timestamp: Date.now(),
          }),
        });

        // Register RPC: component-state
        ctx.rpc.register({
          name: RPC_METHODS.COMPONENT_STATE,
          type: RPC_TYPES.QUERY,
          handler: async (componentId: unknown) => {
            const id = componentId as string;
            const meta = api.componentRegistry.get(id);
            if (!meta) {
              return { ok: false, error: { code: 'NOT_FOUND', message: `Component ${id} not found` }, timestamp: Date.now() };
            }
            return { ok: true, data: meta, timestamp: Date.now() };
          },
        });

        // Register RPC: rescan
        ctx.rpc.register({
          name: RPC_METHODS.RESCAN,
          type: RPC_TYPES.MUTATION,
          handler: async () => {
            if (api.server) {
              api.server.ws.send({ type: 'full-reload' });
            }
            const count = api.componentRegistry.size;
            return { ok: true, data: { rescanned: count }, timestamp: Date.now() };
          },
        });

        // Register RPC: update-component-state
        ctx.rpc.register({
          name: RPC_METHODS.UPDATE_COMPONENT_STATE,
          type: RPC_TYPES.MUTATION,
          handler: async (args: unknown) => {
            const { componentId, key, value } = args as { componentId: string; key: string; value: unknown };
            const meta = api.componentRegistry.get(componentId);
            if (meta) {
              meta.propKeys = meta.propKeys || [];
              return true;
            }
            return false;
          },
        });

        // Register RPC: set-network-rule
        ctx.rpc.register({
          name: RPC_METHODS.SET_NETWORK_RULE,
          type: RPC_TYPES.MUTATION,
          handler: async (args: unknown) => {
            const rule = args as { id?: string; pattern?: string; method?: string; statusCode?: number; body?: string; enabled?: boolean };
            if (api.isDebug) console.log('[Svelte DevTools] Network rule received:', rule);
            return true;
          },
        });

        // Register RPC: get-routes
        ctx.rpc.register({
          name: RPC_METHODS.GET_ROUTES,
          type: RPC_TYPES.QUERY,
          handler: async () => {
            try {
              const { scanSvelteKitRoutes } = await import('../routes-scanner.js');
              const { resolve } = await import('node:path');
              const routesDir = resolve(api.root, 'src', 'routes');
              const routes = api.hasSvelteKit ? await scanSvelteKitRoutes(routesDir) : [];
              return { ok: true, data: { routes }, timestamp: Date.now() };
            } catch (e) {
              return { ok: false, error: String(e), data: { routes: [] }, timestamp: Date.now() };
            }
          },
        });

        // Store logs API and send init notification
        const ctxAny = ctx as unknown as Record<string, unknown>;
        if (ctxAny.logs) {
          api.logsApi = ctxAny.logs as Record<string, (arg: unknown) => unknown>;
          if (typeof api.logsApi.add === 'function') {
            api.logsApi.add({
              message: 'Svelte DevTools initialized',
              description: 'Component tree, state inspection, and migration scoring active',
              level: 'info',
              category: 'svelte-devtools',
            } as unknown);
          }
        }

        // Set up agent shared state
        const rpcAny = ctx.rpc as unknown as Record<string, unknown>;
        if (rpcAny.sharedState) {
          (rpcAny.sharedState as Record<string, (arg: string, opts: Record<string, unknown>) => Promise<unknown>>).get?.('svelte-devtools:agent-state', {
            initialValue: { lastBuildStatus: null, recentErrors: [], componentCount: 0 },
          }).catch(() => {});
        }
      },
    },
  };
}
