// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'node:http';
import { svelteDevTools } from '../../packages/vite-plugin/src/index.js';
import { getServerEvents } from '../../packages/vite-plugin/src/server-events.js';

// Use actual ServerResponse write/end overloads, buffers, callbacks and finish events.
describe('generic HTTP tracing', () => {
    it('counts streamed bytes, bounds previews, isolates servers, and disposes middleware-mode ownership', async () => {
        const originalFetch = globalThis.fetch;
        let ownerA: object;
        const pluginA = svelteDevTools();
        const configure = pluginA.configureServer as (server: any) => any;
        pluginA.configureServer = function(server) { ownerA = server; return configure.call(this, server); };
        const viteA = await createViteServer({ configFile: false, logLevel: 'silent', plugins: [pluginA], server: { middlewareMode: true }, appType: 'custom' });
        const viteB = await createViteServer({ configFile: false, logLevel: 'silent', plugins: [svelteDevTools()], server: { middlewareMode: true }, appType: 'custom' });
        const responseText = 'é'.repeat(4000);
        const app = createServer((req, res) => viteA.middlewares(req, res, () => {
            res.setHeader('content-type', 'text/plain');
            res.write(responseText.slice(0, 2000), 'utf8');
            res.end(responseText.slice(2000), 'utf8');
        }));
        await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
        try {
            const address = app.address() as { port: number };
            const response = await originalFetch(`http://127.0.0.1:${address.port}/stream`);
            expect(await response.text()).toBe(responseText);
            const events = getServerEvents(undefined, ownerA!);
            expect(events).toHaveLength(1);
            expect(events[0].data).toMatchObject({ responseSize: 8000, responsePreview: 'é'.repeat(250), responseBodyTruncated: true });
            expect(getServerEvents(undefined, viteB)).toEqual([]);
            await viteA.close();
            expect(globalThis.fetch).not.toBe(originalFetch);
            expect(getServerEvents(undefined, ownerA!)).toEqual([]);
            await viteB.close();
            expect(globalThis.fetch).toBe(originalFetch);
        } finally {
            await viteA.close();
            await viteB.close();
            await new Promise<void>((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
        }
    });
});
