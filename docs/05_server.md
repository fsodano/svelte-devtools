# Server Integration

SvelteKit server-side integration for tracing HTTP requests during SSR.

**Status**: implemented — basic request tracing. There is **no standalone `packages/server`**; all server-side logic lives inside `packages/vite-plugin` (`server-events.ts`, `server-api.ts`, `sveltekit.ts`, and the middleware in `index.ts`).

## Overview

The Vite plugin provides server-side request tracing out of the box:

- **SvelteKit SSR traces** — the `svelteDevToolsHandle()` hook traces every SSR response with `event.route.id`, method, status, duration, headers, and JSON response previews (`server:ssr` / `server:error` event types)
- **SvelteKit fetch traces** — a `globalThis.fetch` interceptor installed at module load captures load-function fetches as `server:request` events (it must be installed before SvelteKit caches fetch for load functions)
- **Generic HTTP traces** — a Vite middleware records every non-asset, non-devtools request (URL, method, status, duration, response preview, request/response headers)
- **Client fetch traces** — the browser runtime also intercepts `window.fetch`, emitting `client:request` events shown in the Network tab

## Usage

### SvelteKit Handle

Add the SvelteKit handle helper to `src/hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

The handle:
1. Injects the Vite DevTools client script + Svelte runtime script into every SSR response via `transformPageChunk`
2. Traces the request (duration, status, headers, response preview, `routeId`)
3. `noopHandle()` is a zero-overhead pass-through for production

## How It Works

### Event Store (`server-events.ts`)

An in-memory ring buffer:

```typescript
interface ServerEvent {
  id: string;          // 'evt-...' or 'srv-...'
  type: string;        // 'server:request' | 'server:ssr' | 'server:error' | 'server:trace'
  timestamp: number;
  duration?: number;
  data: {
    url: string;
    method: string;
    statusCode?: number;
    routeId?: string;            // SvelteKit route id (e.g. '/counter')
    requestBody?: string;
    responseSize?: number;
    responsePreview?: string;
    reqHeaders?: Record<string, unknown>;
    resHeaders?: Record<string, unknown>;
    _handler?: string;           // 'fetch-interceptor' | 'sveltekit' | 'generic'
  };
}
```

- Capped at `MAX_EVENTS = 1000` entries (oldest evicted)
- `seenIds` dedup map avoids double-recording the same request (SvelteKit handle + generic middleware)
- Exports `addServerEvent(event)`, `getServerEvents({last?, sinceId?})`, `clearServerEvents()`

### API Endpoints

All endpoints require the per-run bearer token (`Authorization: Bearer <token>`, or `?token=<token>` for beacon-only requests). Requests without a valid token get `401`. Set `SVELTE_DEVTOOLS_TOKEN` before starting the dev server, or copy the token printed in the terminal.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__svelte-devtools/server-events` | `GET` | All server events (`?last=N`, `?sinceId=X`) |
| `/__svelte-devtools/server-events` | `DELETE` | Clear all server events |
| `/__svelte-devtools/api/server-events` | `GET` / `DELETE` | Same data under the JSON API prefix |

```bash
curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/server-events | jq '.events | length'
```

### Client Display

The DevTools panel polls `/__svelte-devtools/server-events` every second and displays the events in the **Network** tab (`NetworkDesk.svelte`), alongside client-side `client:request` events and a Mock Rules editor.

## Security Considerations

1. **Dev-only**: All tracing middleware only runs when `apply: 'serve'`
2. **No production impact**: `noopHandle()` passes requests through unchanged; the plugin is never loaded in production builds
3. **Memory bounded**: Event buffer is capped at 1000 entries
4. **Header privacy**: the `cookie` request header is logged only as `'[present]'` (generic middleware)
5. **Token required**: every server-events endpoint requires the per-run bearer token; CORS is allow-listed to localhost and configured origins (ADR-0009)

## Troubleshooting

### No server events in timeline

Ensure you are in development mode and the DevTools panel is open:

```javascript
// In browser console (the plugin exposes the per-run token on the page)
fetch('/__svelte-devtools/server-events?token=' + encodeURIComponent(window.__SVELTE_DEVTOOLS_TOKEN__))
  .then(r => r.json())
  .then(console.log);
```

Also make sure `src/hooks.server.ts` exists with `svelteDevToolsHandle()` — without it, SvelteKit requests bypass the generic Vite middleware for HTML pages.

## Implementation Status

Completed:
- ✅ SvelteKit SSR request tracing (routeId, headers, previews)
- ✅ `globalThis.fetch` interceptor for load functions (`server:request`)
- ✅ Generic Vite middleware request tracing
- ✅ Client-side `window.fetch` tracing (`client:request`)
- ✅ Server events endpoints (`GET` / `DELETE`)
- ✅ Client-side polling and display (Network tab)

Planned:
- 🚧 Database query tracing
- 🚧 Full network interception engine (block/mock) — see [ADR-0007](./adr/ADR-0007-network-interception-architecture.md)
