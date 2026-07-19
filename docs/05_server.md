# Server Integration

**Status**: Experimental – basic request tracing only.

SvelteKit server-side integration for tracing HTTP requests during SSR.

## Overview

The Vite plugin provides lightweight server-side request tracing out of the box. No separate server package is required.

Traced data includes:
- Request URL and HTTP method
- Response status code
- Request duration
- Server errors (status >= 400)

## Usage

### SvelteKit Handle

Add the SvelteKit handle helper to `src/hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { svelteDevToolsHandle, noopHandle } from '@svelte-devtools/vite-plugin/sveltekit';

export const handle: Handle = dev ? svelteDevToolsHandle() : noopHandle();
```

The handle helper currently passes requests through unchanged. All server tracing is performed by the Vite plugin middleware.

## How It Works

### Request Tracing

The Vite plugin installs middleware during development that intercepts every HTTP request:

1. **Start timer** when request begins
2. **Record event** when response finishes
3. **Store event** in an in-memory buffer (max 1000 events)
4. **Serve events** via `/__svelte-devtools/server-events` endpoint

### Event Schema

```typescript
interface ServerEvent {
  id: string;        // Unique event ID
  type: string;      // 'server:trace' or 'server:error'
  timestamp: number; // Request start time
  duration?: number; // Request duration in ms
  data: {
    url: string;
    method: string;
    statusCode: number;
  };
}
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__svelte-devtools/server-events` | `GET` | Get all server events (supports `?last=N` and `?sinceId=X`) |
| `/__svelte-devtools/server-events` | `DELETE` | Clear all server events |

Example:

```bash
curl http://localhost:5173/__svelte-devtools/server-events
```

## Client Display

The DevTools UI polls `/__svelte-devtools/server-events` every second and displays server events in the **Server View** tab.

## Security Considerations

1. **Dev-only**: Server tracing middleware only runs when `apply: 'serve'`
2. **No production impact**: The plugin is never loaded in production builds
3. **Memory bounded**: Event buffer is capped at 1000 entries

## Troubleshooting

### No server events in timeline

Ensure you are in development mode and the DevTools UI is open:

```javascript
// In browser console
fetch('/__svelte-devtools/server-events')
  .then(r => r.json())
  .then(console.log);
```

## Implementation Status

Completed:
- ✅ Basic request tracing via Vite middleware
- ✅ Server events endpoint (`GET` / `DELETE`)
- ✅ Client-side polling and display

Planned:
- 🚧 SvelteKit load function tracing
- 🚧 Trace headers for server-client correlation
- 🚧 Database query tracing
