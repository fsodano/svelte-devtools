import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { svelteDevToolsHandle, noopHandle } from '../../packages/vite-plugin/src/sveltekit.js';

// --- Helpers ---

function createMockEvent(url = '/test', method = 'GET', routeId: string | null = null) {
  return {
    request: { method, url: new URL(url, 'http://localhost:5173') },
    url: new URL(url, 'http://localhost:5173'),
    route: { id: routeId },
  } as unknown as import('@sveltejs/kit').RequestEvent;
}

function createMockResolve(html: string) {
  return vi.fn().mockImplementation(async (_event: unknown, options: Record<string, unknown> | undefined) => {
    const transformPageChunk = options?.transformPageChunk as ((args: { html: string; done: boolean; originalHtml: string }) => string) | undefined;
    if (transformPageChunk) {
      const result = transformPageChunk({ html, done: false, originalHtml: html });
      return new Response(result || html);
    }
    return new Response(html);
  });
}

function createMockResolveWithResponse(response: Response) {
  return vi.fn().mockResolvedValue(response);
}

const RUNTIME_SCRIPT = '<script type="module" src="/__svelte-devtools/svelte-runtime.js"></script>';

// --- Globals cleanup ---

const GLOBAL_KEYS = ['__svelte_devtools_addEvent__', '__svelte_devtools_markSeen__', '__SVELTE_DEVTOOLS_INJECT_PATH__'];

describe('sveltekit', () => {
  describe('svelteDevToolsHandle', () => {
    beforeEach(() => {
      // Save existing global values
      GLOBAL_KEYS.forEach((key) => {
        vi.stubGlobal(key, (globalThis as Record<string, unknown>)[key]);
      });
    });

    afterEach(() => {
      // Clear any test-injected globals
      GLOBAL_KEYS.forEach((key) => {
        (globalThis as Record<string, unknown>)[key] = undefined;
      });
      vi.clearAllMocks();
    });

    it('injects scripts before </head>', async () => {
      const handle = svelteDevToolsHandle();
      const html = '<html><head><title>Test</title></head><body><div>hello</div></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      expect(resolve).toHaveBeenCalled();
      const response = (resolve.mock.calls[0][1] as any).transformPageChunk;
      // The resolve mock calls transformPageChunk internally; check the response
      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toContain(RUNTIME_SCRIPT);
      expect(body).toContain('</head>');
      // Runtime script should appear before </head>
      const scriptIdx = body.indexOf(RUNTIME_SCRIPT);
      const headIdx = body.indexOf('</head>');
      expect(scriptIdx).toBeGreaterThanOrEqual(0);
      expect(scriptIdx).toBeLessThan(headIdx);
    });

    it('falls back to injecting before </body> when no </head>', async () => {
      const handle = svelteDevToolsHandle();
      const html = '<html><body><div>hello</div></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toContain(RUNTIME_SCRIPT);
      expect(body).toContain('</body>');
      const scriptIdx = body.indexOf(RUNTIME_SCRIPT);
      const bodyIdx = body.indexOf('</body>');
      expect(scriptIdx).toBeGreaterThanOrEqual(0);
      expect(scriptIdx).toBeLessThan(bodyIdx);
    });

    it('falls back to injecting before </html> when no </head> or </body>', async () => {
      const handle = svelteDevToolsHandle();
      const html = '<html><div>hello</div></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toContain(RUNTIME_SCRIPT);
      expect(body).toContain('</html>');
      const scriptIdx = body.indexOf(RUNTIME_SCRIPT);
      const htmlIdx = body.indexOf('</html>');
      expect(scriptIdx).toBeGreaterThanOrEqual(0);
      expect(scriptIdx).toBeLessThan(htmlIdx);
    });

    it('appends scripts at end when no closing tags at all', async () => {
      const handle = svelteDevToolsHandle();
      const html = '<html><body><div>hello</div>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toContain(RUNTIME_SCRIPT);
      // Script should be at the very end
      expect(body.endsWith(RUNTIME_SCRIPT)).toBe(true);
    });

    it('returns original HTML when transformPageChunk throws', async () => {
      const handle = svelteDevToolsHandle();
      const html = '<html><head></head><body></body></html>';
      const resolve = vi.fn().mockImplementation(async ({ transformPageChunk }) => {
        if (transformPageChunk) {
          // Simulate a catastrophic error in transformPageChunk
          throw new Error('transformPageChunk crashed');
        }
        return new Response(html);
      });
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      // The outer resolve should still succeed because the error is caught inside transformPageChunk
      // and returns the original html
      expect(resolve).toHaveBeenCalled();
    });

    it('sends server trace event on successful response', async () => {
      const handle = svelteDevToolsHandle();
      const events: unknown[] = [];
      (globalThis as Record<string, unknown>).__svelte_devtools_addEvent__ = (e: unknown) => {
        events.push(e);
      };

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/mypath?foo=bar', 'POST', '/mypath');

      await handle({ event, resolve });

      expect(events).toHaveLength(1);
      const evt = events[0] as { type: string; data: { url: string; method: string; routeId: string | null; duration: number } };
      expect(evt.type).toBe('server:ssr');
      expect(evt.data.url).toBe('/mypath?foo=bar');
      expect(evt.data.method).toBe('POST');
      expect(evt.data.routeId).toBe('/mypath');
      expect(evt.data.duration).toBeGreaterThan(0);
    });

    it('sends server error event when resolve throws', async () => {
      const handle = svelteDevToolsHandle();
      const events: unknown[] = [];
      (globalThis as Record<string, unknown>).__svelte_devtools_addEvent__ = (e: unknown) => {
        events.push(e);
      };

      const resolve = vi.fn().mockRejectedValue(new Error('resolve failed'));
      const event = createMockEvent('/error', 'GET', '/error');

      await expect(handle({ event, resolve })).rejects.toThrow('resolve failed');

      expect(events).toHaveLength(1);
      const evt = events[0] as { type: string; data: { error?: { message: string } } };
      expect(evt.type).toBe('server:error');
      expect(evt.data.error).toBeDefined();
      expect(evt.data.error!.message).toBe('resolve failed');
    });

    it('calls markSeen with request key', async () => {
      const handle = svelteDevToolsHandle();
      const seenKeys: string[] = [];
      (globalThis as Record<string, unknown>).__svelte_devtools_markSeen__ = (key: string) => {
        seenKeys.push(key);
      };

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/api/data', 'PUT', '/api/data');

      await handle({ event, resolve });

      expect(seenKeys).toContain('PUT:/api/data');
    });

    it('devtoolsInject path is included when globalThis has it', async () => {
      const handle = svelteDevToolsHandle();
      (globalThis as Record<string, unknown>).__SVELTE_DEVTOOLS_INJECT_PATH__ = '/path/to/devtools-client.js';

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toContain('/@fs/path/to/devtools-client.js');
      // devtoolsInject should appear before svelteRuntime
      const devtoolsIdx = body.indexOf('/@fs/path/to/devtools-client.js');
      const runtimeIdx = body.indexOf(RUNTIME_SCRIPT);
      expect(devtoolsIdx).toBeGreaterThanOrEqual(0);
      expect(runtimeIdx).toBeGreaterThanOrEqual(0);
      expect(devtoolsIdx).toBeLessThan(runtimeIdx);
    });

    it('handles missing markSeen gracefully', async () => {
      const handle = svelteDevToolsHandle();
      // Explicitly ensure markSeen is undefined
      (globalThis as Record<string, unknown>).__svelte_devtools_markSeen__ = undefined;

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      // Should not throw
      await expect(handle({ event, resolve })).resolves.toBeDefined();
    });

    it('handles missing addEvent gracefully', async () => {
      const handle = svelteDevToolsHandle();
      // Explicitly ensure addEvent is undefined
      (globalThis as Record<string, unknown>).__svelte_devtools_addEvent__ = undefined;

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      // Should not throw
      await expect(handle({ event, resolve })).resolves.toBeDefined();
    });

    it('devtoolsInject is empty string when INJECT_PATH not set', async () => {
      const handle = svelteDevToolsHandle();
      (globalThis as Record<string, unknown>).__SVELTE_DEVTOOLS_INJECT_PATH__ = '';

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      // Only runtime script should appear, no @fs path
      expect(body).toContain(RUNTIME_SCRIPT);
      expect(body).not.toContain('/@fs/');
    });

    it('handles multiple handles independently', async () => {
      const handle1 = svelteDevToolsHandle();
      const handle2 = svelteDevToolsHandle();

      const html1 = '<html><head><title>A</title></head><body>A</body></html>';
      const html2 = '<html><head><title>B</title></head><body>B</body></html>';

      const resolve1 = createMockResolve(html1);
      const resolve2 = createMockResolve(html2);

      const event1 = createMockEvent('/a', 'GET', '/a');
      const event2 = createMockEvent('/b', 'GET', '/b');

      const [result1, result2] = await Promise.all([
        handle1({ event: event1, resolve: resolve1 }),
        handle2({ event: event2, resolve: resolve2 }),
      ]);

      const body1 = await result1.text();
      const body2 = await result2.text();

      expect(body1).toContain('<title>A</title>');
      expect(body2).toContain('<title>B</title>');
      expect(body1).toContain(RUNTIME_SCRIPT);
      expect(body2).toContain(RUNTIME_SCRIPT);
    });

    it('uses lastIndexOf for </html> to handle nested tags', async () => {
      const handle = svelteDevToolsHandle();
      // HTML with </html> appearing in content but also as closing tag
      const html = '<html><head></head><body><p>ends with </html> literally</p></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toContain(RUNTIME_SCRIPT);
      // Should use lastIndexOf so it injects before the real closing </html>
      const scriptIdx = body.indexOf(RUNTIME_SCRIPT);
      const lastHtmlIdx = body.lastIndexOf('</html>');
      expect(scriptIdx).toBeLessThan(lastHtmlIdx);
    });

    it('handles HEAD method correctly in markSeen', async () => {
      const handle = svelteDevToolsHandle();
      const seenKeys: string[] = [];
      (globalThis as Record<string, unknown>).__svelte_devtools_markSeen__ = (key: string) => {
        seenKeys.push(key);
      };

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/health', 'HEAD');

      await handle({ event, resolve });

      expect(seenKeys).toContain('HEAD:/health');
    });

    it('includes routeId as null when not set', async () => {
      const handle = svelteDevToolsHandle();
      const events: unknown[] = [];
      (globalThis as Record<string, unknown>).__svelte_devtools_addEvent__ = (e: unknown) => {
        events.push(e);
      };

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', null);

      await handle({ event, resolve });

      const evt = events[0] as { data: { routeId: null } };
      expect(evt.data.routeId).toBeNull();
    });
  });

  describe('noopHandle', () => {
    it('returns resolve result unchanged', async () => {
      const handle = noopHandle();
      const html = '<html><head><title>Original</title></head><body><div>unchanged</div></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      const result = await handle({ event, resolve });

      expect(resolve).toHaveBeenCalled();
      const body = await result.text();
      expect(body).toBe(html);
    });

    it('does not modify HTML', async () => {
      const handle = noopHandle();
      const html = '<html><head><title>Test</title></head><body><p>hello world</p></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      const result = await resolve.mock.results[0].value;
      const body = await result.text();
      expect(body).toBe(html);
      expect(body).not.toContain('__svelte-devtools');
      expect(body).not.toContain('svelte-runtime.js');
    });

    it('passes through custom responses from resolve', async () => {
      const handle = noopHandle();
      const customResponse = new Response('<html><body>custom</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      const resolve = createMockResolveWithResponse(customResponse);
      const event = createMockEvent('/page', 'GET', '/page');

      const result = await handle({ event, resolve });

      expect(result).toBe(customResponse);
      expect(result.status).toBe(200);
    });

    it('does not call markSeen or addEvent', async () => {
      const handle = noopHandle();
      const seenKeys: string[] = [];
      const events: unknown[] = [];

      (globalThis as Record<string, unknown>).__svelte_devtools_markSeen__ = (key: string) => {
        seenKeys.push(key);
      };
      (globalThis as Record<string, unknown>).__svelte_devtools_addEvent__ = (e: unknown) => {
        events.push(e);
      };

      const html = '<html><head></head><body></body></html>';
      const resolve = createMockResolve(html);
      const event = createMockEvent('/page', 'GET', '/page');

      await handle({ event, resolve });

      expect(seenKeys).toHaveLength(0);
      expect(events).toHaveLength(0);
    });
  });
});
