import { NetworkInterceptor, type NetworkMockRule, type NetworkRequest } from './network.js';

/** Connect the panel's session rules to browser request interception. */
export function installNetworkTools(onRequest: (request: NetworkRequest) => void): void {
  const interceptor = new NetworkInterceptor(onRequest);
  interceptor.install();
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (data?.type === 'svelte-devtools-get-mock-rules') {
      (event.source as Window | null)?.postMessage({ type: 'svelte-devtools-mock-rules', rules: interceptor.getRules() }, event.origin);
    }
    if (data?.type !== 'svelte-devtools-set-mock-rules' || !Array.isArray(data.rules)) return;
    const rules = data.rules.filter((rule: NetworkMockRule) => {
      if (!rule || typeof rule.id !== 'string' || typeof rule.pattern !== 'string'
        || typeof rule.enabled !== 'boolean' || !Number.isInteger(rule.statusCode)
        || rule.statusCode < 200 || rule.statusCode > 599) return false;
      try { new RegExp(rule.pattern); return true; } catch { return false; }
    });
    interceptor.setRules(rules);
  });
}
