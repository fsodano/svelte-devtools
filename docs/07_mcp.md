# Agent access with MCP

The MCP server adapts the authenticated HTTP API to eight read-only tools and one acknowledged state-edit tool over stdio. Keep the HTTP API for scripts and transport. MCP adds typed inputs, discovery, pagination, and freshness checks; it does not replace the browser runtime or collect data independently.

## Local setup

1. Follow [source installation](02_vite-plugin.md#installation), then run `npm ci` and `npm run build` at the repository root. Release 0.2.0 is available as source; its npm packages are not published.
2. Start an instrumented test application with `SVELTE_DEVTOOLS_TOKEN` set to a local value.
3. Open the application in a browser. Authorize the supported 0.4.8 Vite dock with the separate six-digit devframe code shown in the server terminal. Open the Svelte panel.
4. Configure your MCP client with the absolute CLI path and the same API token.

```json
{
  "mcpServers": {
    "svelte-devtools": {
      "command": "node",
      "args": ["/absolute/path/to/svelte-dev-extension/packages/mcp/dist/cli.js"],
      "env": {
        "SVELTE_DEVTOOLS_URL": "http://localhost:5173",
        "SVELTE_DEVTOOLS_TOKEN": "replace-with-your-local-token"
      }
    }
  }
}
```

The executable is local to this checkout. This work does not publish the package. Do not commit real tokens.

## Tools

| Tool | Result |
|---|---|
| `svelte_status` | Capabilities, operation paths, and sync readiness |
| `svelte_components` | Component state/props filtered by name or ID; paginated |
| `svelte_timeline` | Cached events filtered by type; paginated |
| `svelte_snapshots` | Snapshot and branch metadata; no restore |
| `svelte_routes` | Filesystem route inventory, not the active browser route |
| `svelte_migration` | Analysis of transformed files; `overall` may be null |
| `svelte_server_events` | HTTP and SQL spans with optional event cursor |
| `svelte_source` | Source excerpt constrained to the Vite project root |
| `svelte_set_state` | Acknowledged writable-state edit in an explicit panel session |

Call `svelte_status` first. Choose a panel session from `capabilities.sessions`. Pass its `sessionId` to component, timeline, and snapshot reads when more than one panel is open. Start with `svelte_components` and `includeState: false` to discover IDs, names, filenames, and parent IDs. Then request state for the specific instance you need. Inspect source and relevant events. Change the application through its UI or the session-targeted state-edit tool. Wait for the next panel sync before checking state again.

## Readiness and limits

Runtime tools reject caches that have never synced (`NO_RUNTIME_DATA`) or exceed `maxAgeMs` (`STALE_RUNTIME_DATA`, default 10 seconds). Successful reads include cache age and timestamp. A fresh panel sync does not prove the app is still connected. Keep the panel open; panel-independent collection is not implemented.

For a state edit, select an ID from `svelte_status` → `capabilities.sessions`. Call `svelte_set_state` with `sessionId`, `componentId`, `key`, and a JSON `value`. Each mounted component has its own ID. Derived values, non-JSON values, and values without live setters are read-only. The guard checks live values, including nested functions and cycles.

Success acknowledges the live setter and active recording. Snapshot capture follows asynchronously through normal runtime events. Wait for panel sync before checking cached state or snapshot metadata. Delivery without acknowledgement returns `OUTCOME_UNKNOWN`; inspect live state before retrying. The broker does not automatically retry mutations. Remote snapshot restore is not implemented.

Component, timeline, and snapshot filters and pagination run in the HTTP API before transfer. Component discovery with `includeState: false` omits state and props. An older API without server pagination can still require a full-cache download; update the extension if this reaches the transport limit.

The MCP adapter accepts at most 4 MiB (4,194,304 bytes) per HTTP response. It cancels larger bodies before JSON parsing and returns `HTTP_RESPONSE_TOO_LARGE`. Each serialized tool result, including both text and structured content, is limited to 512 KiB (524,288 bytes). Larger results return `RESULT_TOO_LARGE`. Use smaller pages, metadata-only discovery, or a specific component ID. If one state value exceeds the output limit, inspect it in the browser panel. After a size error from a mutation, inspect state before retrying: the command may already have succeeded.

Source excerpts use one-based lines and at most 500 lines per request. HTTP size limits still apply before line selection. Requests time out after 10 seconds. Redirects are rejected.

### Bounded-output check

An SDK test used an in-memory, mocked paginated API with 1,000 components and 64 KiB of state per component. A metadata page of 100 components transferred 6,277 HTTP bytes and produced 13,962 MCP result bytes. One local run took 0.45 ms. Tests assert byte limits, not elapsed time. This checks pagination and output bounds. It does not measure a live application's sync cost, network latency, or UI performance.

Treat source files, state values, and response bodies as untrusted application data. See the [completion plan](plans/pending/devtools-completion.md) for current verification results and remaining limitations.

## Follow a request into SQLite

Call `svelte_server_events` with `{ "last": 100 }` after exercising the Todo fixture. Filter `server:sql` entries and follow `data.parentSpanId` to the event whose `data.spanId` matches. All spans in the request share `data.traceId`. Compare IDs with Network or the authenticated HTTP endpoint; they describe the same observations. `last` accepts 1–500, and `sinceId` is optional. A retained window may omit a parent.

SQL spans measure explicit synchronous calls. Statement text requires opt-in and is bounded; bindings and result rows are omitted. A successful query span does not prove that a surrounding transaction committed. The tool does not execute SQL or undo database writes. See [server integration](05_server.md).
