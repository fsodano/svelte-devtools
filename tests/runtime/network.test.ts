import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkInterceptor, NetworkMockRule } from '../../packages/runtime/src/network.js';

describe('NetworkInterceptor', () => {
  let interceptor: NetworkInterceptor;
  let originalFetch: typeof globalThis.fetch;
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalXHR = globalThis.XMLHttpRequest;

    // Ensure fetch exists so install() doesn't fail on .bind(globalThis)
    if (typeof globalThis.fetch !== 'function') {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('')) as unknown as typeof globalThis.fetch;
    }

    interceptor = new NetworkInterceptor();
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      interceptor.uninstall();
    } catch {
      // ignore cleanup errors
    }
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXHR;
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('isInstalled() returns false initially', () => {
      expect(interceptor.isInstalled()).toBe(false);
    });

    it('install() returns true and isInstalled() returns true after', () => {
      expect(interceptor.install()).toBe(true);
      expect(interceptor.isInstalled()).toBe(true);
    });

    it('install() returns false on second call (already installed)', () => {
      interceptor.install();
      expect(interceptor.install()).toBe(false);
    });

    it('uninstall() returns true and isInstalled() returns false after', () => {
      interceptor.install();
      expect(interceptor.uninstall()).toBe(true);
      expect(interceptor.isInstalled()).toBe(false);
    });

    it('uninstall() returns false if not installed', () => {
      expect(interceptor.uninstall()).toBe(false);
    });
  });

  // ─── Rules management ─────────────────────────────────────────────────────

  describe('rules management', () => {
    it('getRules() returns empty array initially', () => {
      expect(interceptor.getRules()).toEqual([]);
    });

    it('setRules() stores rules and getRules() returns them', () => {
      const rules: NetworkMockRule[] = [
        { id: '1', pattern: '.*', statusCode: 200, enabled: true },
      ];
      interceptor.setRules(rules);
      expect(interceptor.getRules()).toEqual(rules);
    });

    it('getRules() returns a copy, not the internal reference', () => {
      const rules: NetworkMockRule[] = [
        { id: '1', pattern: '.*', statusCode: 200, enabled: true },
      ];
      interceptor.setRules(rules);
      const returned = interceptor.getRules();
      returned.push({ id: '2', pattern: '/other', statusCode: 404, enabled: true });
      expect(interceptor.getRules()).toHaveLength(1);
    });
  });

  // ─── Constructor callback ─────────────────────────────────────────────────

  describe('constructor callback', () => {
    it('accepts a (request) => void callback and fires it on fetch mock responses', async () => {
      const callback = vi.fn();
      const interceptWithCb = new NetworkInterceptor(callback);
      interceptWithCb.install();

      interceptWithCb.setRules([
        { id: '1', pattern: '.*', statusCode: 200, body: 'hello', enabled: true },
      ]);

      await fetch('http://example.com/test');

      expect(callback).toHaveBeenCalledTimes(1);
      const req = callback.mock.calls[0][0];
      expect(req.url).toBe('http://example.com/test');
      expect(req.method).toBe('GET');
      expect(req.statusCode).toBe(200);
      expect(req.responseBody).toBe('hello');
      expect(req.mockResponse).toBe(true);
      expect(req.id).toBeDefined();
      expect(req.timestamp).toBeGreaterThan(0);

      interceptWithCb.uninstall();
    });

    it('fires callback on XHR mock responses', () => {
      const callback = vi.fn();
      const interceptWithCb = new NetworkInterceptor(callback);
      interceptWithCb.install();

      interceptWithCb.setRules([
        { id: '1', pattern: '.*', statusCode: 201, body: 'xhr-ok', enabled: true },
      ]);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://example.com/data');
      xhr.send('payload');

      // Callback is invoked synchronously from send() for mock responses
      expect(callback).toHaveBeenCalledTimes(1);
      const req = callback.mock.calls[0][0];
      expect(req.url).toBe('http://example.com/data');
      expect(req.method).toBe('POST');
      expect(req.statusCode).toBe(201);
      expect(req.responseBody).toBe('xhr-ok');
      expect(req.mockResponse).toBe(true);

      interceptWithCb.uninstall();
    });
  });

  // ─── Rule matching (tested via behaviour) ─────────────────────────────────

  describe('rule matching', () => {
    beforeEach(() => {
      // Mock fetch so passthrough uses the mock instead of happy-dom's real fetch
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('passthrough')) as unknown as typeof globalThis.fetch;
    });

    it('matches requests using a regex pattern', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: 'example\\.com/api', statusCode: 200, body: 'matched', enabled: true },
      ]);

      await fetch('http://example.com/api/v1');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].mockResponse).toBe(true);
      expect(callback.mock.calls[0][0].responseBody).toBe('matched');

      i.uninstall();
    });

    it('rule with method filter only matches that method', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: '.*', method: 'POST', statusCode: 200, body: 'post-only', enabled: true },
      ]);

      await fetch('http://example.com/test', { method: 'GET' });

      // GET shouldn't match the POST-only rule -> passthrough (mockResponse: false)
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].mockResponse).toBe(false);

      i.uninstall();
    });

    it('rule with no method filter matches any method', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: '.*', statusCode: 200, body: 'any-method', enabled: true },
      ]);

      await fetch('http://example.com/test', { method: 'PUT' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].mockResponse).toBe(true);
      expect(callback.mock.calls[0][0].responseBody).toBe('any-method');

      i.uninstall();
    });

    it('disabled rule is skipped', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: '.*', statusCode: 200, body: 'disabled-body', enabled: false },
      ]);

      await fetch('http://example.com/test');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].mockResponse).toBe(false);

      i.uninstall();
    });

    it('invalid regex pattern is silently skipped (falls through to next rule)', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: '[invalid', statusCode: 200, body: 'bad', enabled: true },
        { id: '2', pattern: '.*', statusCode: 200, body: 'fallback', enabled: true },
      ]);

      await fetch('http://example.com/test');

      expect(callback).toHaveBeenCalledTimes(1);
      // Should match the second valid rule
      expect(callback.mock.calls[0][0].mockResponse).toBe(true);
      expect(callback.mock.calls[0][0].responseBody).toBe('fallback');

      i.uninstall();
    });
  });

  // ─── Fetch interception ───────────────────────────────────────────────────

  describe('fetch interception', () => {
    it('with a mock rule, fetch returns mocked response with status, body, and headers', async () => {
      interceptor.install();

      interceptor.setRules([
        {
          id: '1',
          pattern: '.*',
          statusCode: 201,
          body: '{"ok":true}',
          headers: { 'x-mock': 'true', 'content-type': 'application/json' },
          enabled: true,
        },
      ]);

      const response = await fetch('http://example.com/test');

      expect(response.status).toBe(201);
      expect(response.statusText).toBe('Mocked');
      const body = await response.text();
      expect(body).toBe('{"ok":true}');
      expect(response.headers.get('x-mock')).toBe('true');
      expect(response.headers.get('content-type')).toBe('application/json');

      interceptor.uninstall();
    });

    it('without a mock rule, fetch passes through to original fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('real response', { status: 200, statusText: 'OK' }));
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const i = new NetworkInterceptor();
      i.install();

      // No rules set — should pass through
      const response = await fetch('http://example.com/test');

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      const body = await response.text();
      expect(body).toBe('real response');

      i.uninstall();
    });

    it('onRequest callback fires with request details (url, method, statusCode, mockResponse)', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: '.*', statusCode: 418, body: 'teapot', enabled: true },
      ]);

      await fetch('http://example.com/brew', { method: 'POST', headers: { 'content-type': 'text/plain' } });

      expect(callback).toHaveBeenCalledTimes(1);
      const req = callback.mock.calls[0][0];
      expect(req.url).toBe('http://example.com/brew');
      expect(req.method).toBe('POST');
      expect(req.statusCode).toBe(418);
      expect(req.mockResponse).toBe(true);
      expect(req.id).toMatch(/^net-/);

      i.uninstall();
    });
  });

  // ─── XHR interception ─────────────────────────────────────────────────────

  describe('XHR interception', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('XHR with a mock rule returns mock response (status, responseText)', () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([
        { id: '1', pattern: '.*', statusCode: 202, body: 'accepted', enabled: true },
      ]);

      const xhr = new XMLHttpRequest();
      const loadHandler = vi.fn();
      xhr.addEventListener('load', loadHandler);
      xhr.open('GET', 'http://example.com/submit');
      xhr.send();

      // Callback fires synchronously during send() for matched mock rules
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].url).toBe('http://example.com/submit');
      expect(callback.mock.calls[0][0].mockResponse).toBe(true);

      // Advance timers to fire the setTimeout(0) that dispatches events
      vi.advanceTimersByTime(0);

      expect(loadHandler).toHaveBeenCalledTimes(1);
      expect(xhr.status).toBe(202);
      expect(xhr.responseText).toBe('accepted');

      i.uninstall();
    });

    it('XHR mock response includes custom headers', () => {
      const i = new NetworkInterceptor();
      i.install();

      i.setRules([
        {
          id: '1',
          pattern: '.*',
          statusCode: 200,
          body: 'ok',
          headers: { 'x-custom': 'value' },
          enabled: true,
        },
      ]);

      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'http://example.com/test');
      xhr.send();

      vi.advanceTimersByTime(0);

      expect(xhr.status).toBe(200);
      expect(xhr.responseText).toBe('ok');

      i.uninstall();
    });

    it('XHR proxy delegates core properties without throwing', () => {
      interceptor.install();

      const xhr = new XMLHttpRequest();

      // All getter-delegated properties should be readable
      expect(typeof xhr.readyState).toBe('number');
      expect(typeof xhr.status).toBe('number');
      expect(typeof xhr.statusText).toBe('string');
      expect(typeof xhr.responseText).toBe('string');

      // Key methods should exist and be callable
      expect(typeof xhr.open).toBe('function');
      expect(typeof xhr.send).toBe('function');
      expect(typeof xhr.setRequestHeader).toBe('function');
      expect(typeof xhr.abort).toBe('function');
      expect(typeof xhr.getResponseHeader).toBe('function');
      expect(typeof xhr.getAllResponseHeaders).toBe('function');
      expect(typeof xhr.addEventListener).toBe('function');
      expect(typeof xhr.removeEventListener).toBe('function');
      expect(typeof xhr.overrideMimeType).toBe('function');

      // Calling open should track method & url on the proxy
      xhr.open('DELETE', 'http://example.com/resource');
      expect(() => xhr.setRequestHeader('authorization', 'Bearer token')).not.toThrow();
      expect(() => xhr.getResponseHeader('content-type')).not.toThrow();
      expect(() => xhr.getAllResponseHeaders()).not.toThrow();

      interceptor.uninstall();
    });

    it('XHR proxy setter for responseType does not throw', () => {
      interceptor.install();

      const xhr = new XMLHttpRequest();
      expect(() => {
        xhr.responseType = 'json';
      }).not.toThrow();

      interceptor.uninstall();
    });
  });

  // ─── Uninstall cleanup ────────────────────────────────────────────────────

  describe('uninstall cleanup', () => {
    it('restores original globalThis.fetch after uninstall', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('restored-fetch'));
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const i = new NetworkInterceptor();
      i.install();
      i.uninstall();

      // After uninstall, calling fetch should use the restored implementation
      const res = await globalThis.fetch('http://example.com/after');
      const text = await res.text();
      expect(text).toBe('restored-fetch');
    });

    it('restores original globalThis.XMLHttpRequest after uninstall', () => {
      const OrigXHR = globalThis.XMLHttpRequest;

      const i = new NetworkInterceptor();
      i.install();
      i.uninstall();

      // The exact class reference should be restored
      expect(globalThis.XMLHttpRequest).toBe(OrigXHR);
    });

    it('after uninstall, a new XMLHttpRequest is the original class, not the proxy', () => {
      const OrigXHR = globalThis.XMLHttpRequest;

      const i = new NetworkInterceptor();
      i.install();
      i.uninstall();

      const xhr = new XMLHttpRequest();
      // Should be an instance of the original, not the proxy
      expect(xhr).toBeInstanceOf(OrigXHR);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('passthrough')) as unknown as typeof globalThis.fetch;
    });

    it('handles empty rules array gracefully', async () => {
      const callback = vi.fn();
      const i = new NetworkInterceptor(callback);
      i.install();

      i.setRules([]);

      // No rules means all requests pass through
      const response = await fetch('http://example.com/empty-rules');
      expect(response).toBeDefined();

      i.uninstall();
    });

    it('constructing without a callback does not throw', () => {
      expect(() => new NetworkInterceptor()).not.toThrow();
      expect(() => new NetworkInterceptor(undefined)).not.toThrow();
    });

    it('install can be called multiple times across instances without crashing', () => {
      const a = new NetworkInterceptor();
      const b = new NetworkInterceptor();

      expect(a.install()).toBe(true);
      expect(b.install()).toBe(true);
      expect(a.isInstalled()).toBe(true);
      expect(b.isInstalled()).toBe(true);

      a.uninstall();
      b.uninstall();

      expect(a.isInstalled()).toBe(false);
      expect(b.isInstalled()).toBe(false);
    });
  });
});
