/**
 * Network Interceptor for Svelte DevTools
 * 
 * Overrides window.fetch and XMLHttpRequest to inspect and mock HTTP requests.
 * Supports dynamic rule-based matching for request blocking, modification, and mocking.
 */

export interface NetworkMockRule {
  id: string;
  pattern: string;
  method?: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  enabled: boolean;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  statusCode?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  duration?: number;
  timestamp: number;
  mockResponse?: boolean;
}

export type NetworkRequestCallback = (request: NetworkRequest) => void;

/**
 * Browser-side network interceptor for fetch and XHR.
 */
export class NetworkInterceptor {
  private rules: NetworkMockRule[] = [];
  private originalFetch: typeof globalThis.fetch | null = null;
  private originalXHR: typeof XMLHttpRequest | null = null;
  private installed = false;

  constructor(private onRequest?: NetworkRequestCallback) {}

  /**
   * Install the interceptor, overriding window.fetch and XMLHttpRequest.
   */
  install(): boolean {
    if (this.installed) return false;
    this.installed = true;

    try {
      // Override fetch
      this.originalFetch = globalThis.fetch.bind(globalThis);
      const self = this;
      globalThis.fetch = async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        return self.handleFetch(input, init);
      };

      // Override XMLHttpRequest
      const origXHR: typeof XMLHttpRequest = globalThis.XMLHttpRequest;
      this.originalXHR = origXHR;
      const XHRProxy = class extends EventTarget {
        private xhr: XMLHttpRequest;
        private method = '';
        private url = '';
        private requestHeaders: Record<string, string> = {};
        private startTime = 0;
        private requestBody = '';

        constructor() {
          super();
          this.xhr = new origXHR();
        }

        // Delegate all XMLHttpRequest properties/methods
        get readyState() { return this.xhr.readyState; }
        get status() { return this.xhr.status; }
        get statusText() { return this.xhr.statusText; }
        get responseText() { return this.xhr.responseText; }
        get response() { return this.xhr.response; }
        get responseType() { return this.xhr.responseType; }
        set responseType(v: XMLHttpRequestResponseType) { this.xhr.responseType = v; }
        get responseURL() { return this.xhr.responseURL; }

        open(method: string, url: string | URL, async = true, user?: string, password?: string) {
          this.method = method.toUpperCase();
          this.url = typeof url === 'string' ? url : url.toString();
          this.startTime = performance.now();
          this.xhr.open(method, url, async, user, password);
        }

        setRequestHeader(header: string, value: string) {
          this.requestHeaders[header] = value;
          this.xhr.setRequestHeader(header, value);
        }

        send(body?: Document | XMLHttpRequestBodyInit | null) {
          if (body) this.requestBody = typeof body === 'string' ? body : String(body);
          
          // Check for matching mock rule
          const rule = self.matchRequest(this.url, this.method);
          if (rule && rule.enabled) {
            // Mock response
            const mockResponse = self.createMockResponse(rule);
            const duration = performance.now() - this.startTime;
            
            // Simulate async response
            setTimeout(() => {
              // Set response properties
              Object.defineProperty(this.xhr, 'status', { value: rule.statusCode });
              Object.defineProperty(this.xhr, 'statusText', { value: '' });
              Object.defineProperty(this.xhr, 'responseText', { value: rule.body || '' });
              Object.defineProperty(this.xhr, 'response', { value: rule.body || '' });
              
              // Dispatch events
              this.xhr.dispatchEvent(new ProgressEvent('load'));
              this.xhr.dispatchEvent(new ProgressEvent('readystatechange'));
            }, 0);

            self.emitRequest({
              id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              url: this.url,
              method: this.method,
              statusCode: rule.statusCode,
              requestHeaders: this.requestHeaders,
              requestBody: this.requestBody,
              responseBody: rule.body,
              duration: Math.round(duration),
              timestamp: Date.now(),
              mockResponse: true,
            });
            return;
          }

          // Pass through to real XHR
          const origOnLoad = this.xhr.onload;
          this.xhr.addEventListener('load', () => {
            const duration = performance.now() - this.startTime;
            self.emitRequest({
              id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              url: this.url,
              method: this.method,
              statusCode: this.xhr.status,
              requestHeaders: this.requestHeaders,
              responseHeaders: self.parseHeaders(this.xhr.getAllResponseHeaders()),
              requestBody: this.requestBody,
              responseBody: this.xhr.responseText?.slice(0, 500),
              duration: Math.round(duration),
              timestamp: Date.now(),
              mockResponse: false,
            });
          });

          this.xhr.send(body);
        }

        abort() { this.xhr.abort(); }
        getResponseHeader(header: string) { return this.xhr.getResponseHeader(header); }
        getAllResponseHeaders() { return this.xhr.getAllResponseHeaders(); }
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) {
          this.xhr.addEventListener(type, listener, options);
        }
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions) {
          this.xhr.removeEventListener(type, listener, options);
        }
        overrideMimeType(mime: string) { this.xhr.overrideMimeType(mime); }
      };

      globalThis.XMLHttpRequest = XHRProxy as unknown as typeof XMLHttpRequest;

      return true;
    } catch (e) {
      console.error('[Svelte DevTools] Failed to install network interceptor:', e);
      return false;
    }
  }

  /**
   * Uninstall the interceptor, restoring original fetch and XHR.
   */
  uninstall(): boolean {
    if (!this.installed) return false;
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
    if (this.originalXHR) {
      globalThis.XMLHttpRequest = this.originalXHR;
    }
    this.installed = false;
    return true;
  }

  /**
   * Set the active mocking rules.
   */
  setRules(rules: NetworkMockRule[]): void {
    this.rules = rules;
  }

  /**
   * Get the current mocking rules.
   */
  getRules(): NetworkMockRule[] {
    return [...this.rules];
  }

  /**
   * Check if the interceptor is installed.
   */
  isInstalled(): boolean {
    return this.installed;
  }

  /**
   * Handle a fetch request.
   */
  private async handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    const method = request.method.toUpperCase();

    // Check mock rules
    const rule = this.matchRequest(url, method);
    if (rule && rule.enabled) {
      this.emitRequest({
        id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url,
        method,
        statusCode: rule.statusCode,
        requestHeaders: Object.fromEntries(request.headers.entries()),
        requestBody: await request.clone().text().catch(() => ''),
        responseBody: rule.body,
        duration: 0,
        timestamp: Date.now(),
        mockResponse: true,
      });
      return this.createFetchResponse(rule, url);
    }

    // Pass through to original fetch
    const startTime = performance.now();
    try {
      const response = await (this.originalFetch!(input, init));
      const duration = performance.now() - startTime;
      const clonedResponse = response.clone();
      
      this.emitRequest({
        id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url,
        method,
        statusCode: response.status,
        statusText: response.statusText,
        requestHeaders: Object.fromEntries(request.headers.entries()),
        responseHeaders: Object.fromEntries(response.headers.entries()),
        requestBody: await request.clone().text().catch(() => ''),
        responseBody: (await clonedResponse.text().catch(() => '')).slice(0, 500),
        duration: Math.round(duration),
        timestamp: Date.now(),
        mockResponse: false,
      });

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.emitRequest({
        id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url,
        method,
        statusCode: 0,
        statusText: (error as Error)?.message || 'Network Error',
        duration: Math.round(duration),
        timestamp: Date.now(),
        mockResponse: false,
      });
      throw error;
    }
  }

  /**
   * Match a request URL and method against the active rules.
   */
  private matchRequest(url: string, method: string): NetworkMockRule | null {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.method && rule.method !== method) continue;
      try {
        const pattern = new RegExp(rule.pattern);
        if (pattern.test(url)) return rule;
      } catch {
        // Invalid regex pattern — skip
        continue;
      }
    }
    return null;
  }

  /**
   * Emit a network request event.
   */
  private emitRequest(request: NetworkRequest): void {
    if (this.onRequest) {
      this.onRequest(request);
    }
  }

  /**
   * Create a mock Response for fetch interception.
   */
  private createFetchResponse(rule: NetworkMockRule, url: string): Response {
    const headers = new Headers(rule.headers || {});
    return new Response(rule.body || '', {
      status: rule.statusCode,
      statusText: rule.statusCode === 200 ? 'OK' : 'Mocked',
      headers,
    });
  }

  /**
   * Create a mock response for XHR interception.
   */
  private createMockResponse(rule: NetworkMockRule): { body: string; headers: Record<string, string> } {
    return {
      body: rule.body || '',
      headers: rule.headers || {},
    };
  }

  /**
   * Parse XHR response headers string into a Record.
   */
  private parseHeaders(headersStr: string): Record<string, string> {
    const result: Record<string, string> = {};
    headersStr.split('\r\n').filter(Boolean).forEach(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        result[key] = val;
      }
    });
    return result;
  }
}
