# Svelte DevTools MCP

Inspect Svelte 5 applications from an MCP client. The server provides eight read-only tools and one acknowledged state-edit tool over stdio. It uses the authenticated DevTools HTTP API as its data transport.

## Run from this repository

Build the workspaces with `npm install && npm run build`. Start an instrumented app with a fixed token:

```sh
SVELTE_DEVTOOLS_TOKEN=your-local-token npm run dev
```

Configure your MCP client to run `node` with the absolute path to `packages/mcp/dist/cli.js`. Pass these environment variables to that process:

- `SVELTE_DEVTOOLS_URL`: Vite origin, such as `http://localhost:5173`.
- `SVELTE_DEVTOOLS_TOKEN`: the same token used by the Vite server.

Example MCP client configuration (replace the absolute path and token):

```json
{
  "mcpServers": {
    "svelte-devtools": {
      "command": "node",
      "args": ["/absolute/path/to/svelte-dev-extension/packages/mcp/dist/cli.js"],
      "env": {
        "SVELTE_DEVTOOLS_URL": "http://localhost:5173",
        "SVELTE_DEVTOOLS_TOKEN": "your-local-token"
      }
    }
  }
}
```

The package is not published by this change. Use the local executable until a release is available. Do not commit real tokens.

## Workflow

1. Call `svelte_status` to discover capabilities and sync readiness.
2. Open the app. Authorize the Vite dock with the separate code or token shown by the installed host. Open the Svelte panel.
3. Call `svelte_components` with a name or ID filter. Inspect props and state.
4. Use `svelte_source` for a source excerpt. Use `svelte_server_events` to follow server requests.
5. To edit writable state, choose a session from `svelte_status` → `capabilities.sessions`. Call `svelte_set_state` with `sessionId`, `componentId`, `key`, and a JSON `value`.
6. Success acknowledges the live setter and active recording. Snapshot capture occurs asynchronously through runtime events. Wait for a new panel sync and inspect again. If delivery returns `OUTCOME_UNKNOWN`, inspect live state before retrying.

| Tool | Purpose |
|---|---|
| `svelte_status` | Server discovery, supported operations, sync metadata |
| `svelte_components` | Filtered, paginated component state and props |
| `svelte_timeline` | Filtered, paginated cached events |
| `svelte_snapshots` | Snapshot and branch metadata; no restore |
| `svelte_routes` | Route inventory from the resolved SvelteKit routes directory |
| `svelte_migration` | Migration analysis of transformed files |
| `svelte_server_events` | Recent server traces, optionally after an event ID |
| `svelte_source` | Source excerpts within the Vite project root |
| `svelte_set_state` | Live state edit in an explicit panel session |

Runtime tools reject data that has never synced or is older than `maxAgeMs` (default 10 seconds). This is a read-time freshness check. It does not change capture behavior. Successful reads include cache age and timestamp. A recent panel sync does not prove that the inspected app is still connected.

## Current limits

- Instrumentation covers component `.svelte` source. Standalone rune modules and precompiled libraries are not instrumented.
- Keep the panel open. Headless, panel-independent collection is not implemented.
- Component IDs identify mounted instances. After remounting, an ID can change. Snapshot remapping rejects ambiguous repeated instances.
- State mutation requires an explicit live panel session. Remote snapshot restore is not implemented.
- Route scanning uses SvelteKit plugin configuration when available. Otherwise it falls back to `src/routes`. Parameter templates are not concrete URLs.
- Pagination bounds returned lists, but the HTTP transport still fetches the full cache. Large individual values can still produce large results.
- HTTP requests time out after 10 seconds. Redirects are rejected to avoid forwarding credentials to a different server.
- App content is returned as data. Treat source, state, and response bodies as untrusted content.

The implementation uses the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).
