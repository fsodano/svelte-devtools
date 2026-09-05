import { afterEach, expect, it, vi } from 'vitest';
import { installNetworkTools } from '../../packages/runtime/src/network-bridge.js';

const originalFetch = globalThis.fetch;
const originalXHR = globalThis.XMLHttpRequest;
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.XMLHttpRequest = originalXHR;
  vi.restoreAllMocks();
});

it('connects same-origin panel rules to real browser fetch interception and returns them on remount', async () => {
  const emit = vi.fn();
  const listenerSpy = vi.spyOn(window, 'addEventListener');
  globalThis.fetch = vi.fn().mockResolvedValue(new Response('original'));
  installNetworkTools(emit);
  const listener = listenerSpy.mock.calls.find(([type]) => type === 'message')![1] as EventListener;
  const rule = { id: 'from-panel', pattern: '/api/items$', statusCode: 201, body: '{"mocked":true}', enabled: true };
  try {
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://untrusted.example', data: { type: 'svelte-devtools-set-mock-rules', rules: [rule] } }));
    expect(await (await fetch('http://localhost/api/items')).text()).toBe('original');
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, data: { type: 'svelte-devtools-set-mock-rules', rules: [rule] } }));
    const response = await fetch('http://localhost/api/items');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ mocked: true });
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({ mockRuleId: 'from-panel', mockResponse: true });
    const source = { postMessage: vi.fn() };
    listener(new MessageEvent('message', { origin: window.location.origin, source: source as unknown as Window, data: { type: 'svelte-devtools-get-mock-rules' } }));
    expect(source.postMessage).toHaveBeenCalledWith({ type: 'svelte-devtools-mock-rules', rules: [rule] }, window.location.origin);
  } finally {
    window.removeEventListener('message', listener);
  }
});
