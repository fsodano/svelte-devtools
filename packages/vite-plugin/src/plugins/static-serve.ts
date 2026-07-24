import type { Plugin, ViteDevServer } from 'vite';
import type { PluginAPI } from '../types.js';
import { DEVTOOLS_PREFIX } from '../utils/options.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import sirv from 'sirv';


const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GLOBAL_KEY = '__svelte_devtools_addEvent__';

type ResolveFn = (id: string) => string;

function resolvePackageRoot(pkgName: string, fallback: string): string {
  try {
    return path.dirname(require.resolve(`${pkgName}/package.json`));
  } catch {
    return fallback;
  }
}

export function staticServe(api: PluginAPI): Plugin {
  return {
    name: 'svelte-devtools:static-serve',
    apply: 'serve',
    enforce: 'pre',

    configureServer(server: ViteDevServer) {
      api.server = server;

      // Resolve paths
      // dirname is packages/vite-plugin/dist/plugins/ (built) or src/plugins/ (source)
      // ../../../ from there reaches the packages/ directory
      const runtimeDistPath = path.resolve(
        resolvePackageRoot('@svelte-devtools/runtime', path.resolve(__dirname, '../../../runtime')),
        'dist'
      );
      const clientDistPath = path.resolve(
        resolvePackageRoot('@svelte-devtools/client', path.resolve(__dirname, '../../../client')),
        'dist'
      );
      const distPath = path.resolve(__dirname, '../../../dist');

      // Resolve @vitejs/devtools inject.js
      let viteDevtoolsInjectPath: string;
      try {
        const devtoolsPkgJson = require.resolve('@vitejs/devtools/package.json', { paths: [api.root] });
        const devtoolsPkgDir = path.dirname(devtoolsPkgJson);
        viteDevtoolsInjectPath = path.resolve(devtoolsPkgDir, 'dist/client/inject.js').replace(/\\/g, '/');
        if (api.isDebug) console.log('[Svelte DevTools] Found @vitejs/devtools inject at:', viteDevtoolsInjectPath);
      } catch {
        viteDevtoolsInjectPath = '';
        if (api.isDebug) console.log('[Svelte DevTools] @vitejs/devtools not found, skipping inject');
      }

      (globalThis as Record<string, unknown>).__SVELTE_DEVTOOLS_INJECT_PATH__ = viteDevtoolsInjectPath;

      // Set up global event collector
      (globalThis as Record<string, unknown>)[GLOBAL_KEY] = (event: unknown) => {
        import('../server-events.js').then(({ addServerEvent }) =>
          addServerEvent(event as Parameters<typeof addServerEvent>[0])
        );
      };

      (globalThis as Record<string, unknown>)['__svelte_devtools_markSeen__'] = (key: string) => {
        api.markSeenTimestamps.set(key, Date.now());
      };

      // Clean up stale marks every 60s
      setInterval(() => {
        const cutoff = Date.now() - 300_000;
        for (const [k, ts] of api.markSeenTimestamps) {
          if (ts < cutoff) api.markSeenTimestamps.delete(k);
        }
      }, 60_000);

      // ── Request tracing middleware ──
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (
          url.startsWith('/__svelte-devtools') ||
          url.startsWith('/@') ||
          url.startsWith('/node_modules') ||
          /\.(js|css|woff2?|map|ico|svg|png|jpg|webp|avif|ttf|eot)(\?|$)/.test(url)
        ) {
          next();
          return;
        }
        const startTime = Date.now();
        const reqKey = `${req.method}:${url}`;

        const originalEnd = res.end.bind(res);
        const bodyChunks: Buffer[] = [];
        const perfStart = performance.now();
        res.end = function (this: typeof res, ...args: unknown[]) {
          const chunk = args[0];
          if (chunk instanceof Buffer || typeof chunk === 'string') {
            bodyChunks.push(Buffer.from(chunk));
          }
          return originalEnd(chunk as never, args[1] as never, args[2] as never);
        } as typeof res.end;

        res.on('finish', () => {
          const duration = performance.now() - perfStart;
          if (api.markSeenTimestamps.has(reqKey)) {
            api.markSeenTimestamps.delete(reqKey);
            return;
          }
          if (/\.(svelte|js|ts|css|json|ico|svg|png|woff2?)$/.test(url)) return;
          const body = Buffer.concat(bodyChunks).toString('utf-8');
          const contentType = (res.getHeader('content-type') as string) || '';
          const isJson = contentType.includes('json');
          import('../server-events.js').then(({ addServerEvent }) => {
            addServerEvent({
              id: `srv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              type: res.statusCode >= 400 ? 'server:error' : 'server:ssr',
              timestamp: startTime,
              duration,
              data: {
                url,
                method: req.method || 'GET',
                statusCode: res.statusCode,
                _handler: 'generic',
                contentType,
                responseSize: body.length,
                responsePreview: isJson ? body.slice(0, 2000) : body.slice(0, 500),
                reqHeaders: {
                  'content-type': req.headers['content-type'],
                  'user-agent': req.headers['user-agent'],
                  'accept': req.headers['accept'],
                  'referer': req.headers['referer'],
                  'content-length': req.headers['content-length'],
                  'cookie': req.headers['cookie'] ? '[present]' : undefined,
                },
                resHeaders: Object.fromEntries(
                  Object.entries(res.getHeaders()).map(([k, v]) => [k, String(v)])
                ),
              },
            });
          });
        });
        next();
      });

      // ── Server events endpoint ──
      server.middlewares.use('/__svelte-devtools/server-events', async (req, res, _next) => {
        try {
          const { method } = req;
          if (method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            const { getServerEvents } = await import('../server-events.js');
            const rawUrl = req.url || '';
            const qsIdx = rawUrl.indexOf('?');
            const params = new URLSearchParams(qsIdx >= 0 ? rawUrl.slice(qsIdx) : '');
            const last = parseInt(params.get('last') || '', 10) || undefined;
            const sinceId = params.get('sinceId') || undefined;
            res.end(JSON.stringify(getServerEvents({ last, sinceId })));
          } else if (method === 'DELETE') {
            const { clearServerEvents } = await import('../server-events.js');
            clearServerEvents();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          console.error('[Svelte DevTools] server-events error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err }));
        }
      });

      // ── Migration score endpoint ──
      server.middlewares.use('/__svelte-devtools/migration-score', async (req, res, _next) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        const results = Array.from(api.componentRegistry.values())
          .filter(m => m.migrationResult)
          .map(m => m.migrationResult!);
        const total = results.length;
        const avgScore = total > 0
          ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total)
          : 100;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ overall: avgScore, totalFiles: total, perFile: results }));
      });

      // ── API endpoint proxy ──
      server.middlewares.use('/__svelte-devtools/api', async (req, res, _next) => {
        const pathname = req.url?.split('?')[0] || '/';
        const { handleApiRequest } = await import('../server-api.js');
        await handleApiRequest(req, res, server, pathname);
      });

      // ── Static file serving (no prefix — checks manually to run before SvelteKit SSR) ──
      server.middlewares.use((req, res, next) => {
        const rawUrl = (req.url || '').split('?')[0];
        if (!rawUrl.startsWith(DEVTOOLS_PREFIX + '/') && rawUrl !== DEVTOOLS_PREFIX) return next();
        if (api.isDebug) console.log('[Svelte DevTools] serve hit:', rawUrl);
        const filePath = rawUrl.startsWith(DEVTOOLS_PREFIX + '/') ? rawUrl.slice(DEVTOOLS_PREFIX.length + 1) : '';

        // Serve runtime script
        if (filePath === 'svelte-runtime.js') {
          const runtimeFile = path.join(runtimeDistPath, 'index.js');
          if (fs.existsSync(runtimeFile)) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store');
            fs.createReadStream(runtimeFile).pipe(res);
            return;
          }
        }

        // Root path → serve client SPA index.html directly
        if (filePath === '' || filePath === 'index.html') {
          const spaIndex = path.join(clientDistPath, 'index.html');
          if (api.isDebug) console.log('[Svelte DevTools] SPA index path:', spaIndex, 'exists:', fs.existsSync(spaIndex));
          if (fs.existsSync(spaIndex)) {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-store');
            res.statusCode = 200;
            const stream = fs.createReadStream(spaIndex);
            stream.on('error', (err) => {
              console.error('[Svelte DevTools] stream error:', err);
              res.statusCode = 500;
              res.end('Internal error');
            });
            stream.pipe(res);
            return;
          }
        }

        // Try serving from client dist (assets, favicon, etc.)
        if (filePath) {
          const clientFile = path.join(clientDistPath, filePath);
          if (fs.existsSync(clientFile) && fs.statSync(clientFile).isFile() && !filePath.includes('..')) {
            // Map extension to MIME type for sirv
            const ext = path.extname(filePath).toLowerCase();
            const mime: Record<string, string> = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon' };
            res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            fs.createReadStream(clientFile).pipe(res);
            return;
          }
        }

        // Serve from vite-plugin dist (e.g. legacy files)
        const fullPath = path.join(distPath, filePath);
        if (filePath && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() && !filePath.includes('..')) {
          sirv(distPath, { dev: true })(req, res, next);
          return;
        }

        // Fallback to client SPA for /__svelte-devtools/ and any unmatched path
        const originalUrl = req.url;
        req.url = '/' + filePath;
        sirv(clientDistPath, { dev: true, single: true })(req, res, (...args: unknown[]) => {
          req.url = originalUrl;
          next(...args);
        });
      });

      // Open-in-editor is now delegated to @sveltejs/vite-plugin-svelte's /__open-in-editor endpoint
    },
  };
}
