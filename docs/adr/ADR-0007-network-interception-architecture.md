# ADR-0007: Network Interception Architecture

## Status
Accepted

## Context
The DevTools can trace HTTP requests via `globalThis.fetch` wrapping and Vite middleware, but it cannot intercept, block, or mock them. During debugging, developers need the ability to inspect outgoing network calls, pause requests to examine payloads, block specific endpoints, and return synthetic responses without modifying application code.

Existing approaches each had limitations. Wrapping `globalThis.fetch` alone doesn't cover `XMLHttpRequest`, which many libraries (Axios, superagent, older jQuery code) still use. Vite middleware operates server-side and can't intercept browser-driven requests. SvelteKit's `handleFetch` hook only covers server-side fetches during SSR, not client-side requests. None of these approaches give the user control over which requests to intercept or what to return.

Key requirements for the interception layer: all network requests must be captured regardless of API (fetch or XHR), interception rules must be dynamic (set from the DevTools UI at runtime), non-matching requests must pass through without latency, and the original implementations must be fully restored on cleanup.

## Decision
Build a dual-layer interception engine with a shared rule set communicated over RPC.

The **client layer** overrides `window.fetch` and `XMLHttpRequest` during DevTools initialization. The override checks each outgoing request against an array of active rules. Each rule specifies a regex pattern for the URL, an HTTP method filter (GET, POST, or `*` for all), and an action: `block`, `mock`, or `pass`. When a request matches a rule with `block`, the promise rejects with a `NetworkError` (for fetch) or the `load` event never fires (for XHR). When a rule has `mock`, the override returns a `Response` object constructed from the rule's `status`, `headers`, and `body` fields. When no rule matches, the request delegates to the original implementation unchanged.

The **server layer** injects a SvelteKit `handleFetch` hook via the Vite plugin's `transformPageChunk` mechanism. The hook receives the same rule set from the shared RPC channel and applies the same match logic to `fetch` calls made during SSR. This ensures that server-side data fetching respects the same interception rules as client-side requests.

Both layers read rules from a shared store exposed by the runtime. The DevTools UI writes to this store via RPC methods (`svelte-devtools:set-network-rules`, `svelte-devtools:clear-network-rules`). Rules are stored as a flat array with positional priority — the first match wins. The store is a plain array wrapped in a Svelte 5 `$state` rune so the UI reacts to rule changes in real time.

Cleanup restores all original implementations. When the DevTools disconnects, the runtime calls `teardown()` which reassigns `window.fetch` and `window.XMLHttpRequest` to the saved originals. The SvelteKit `handleFetch` hook is removed by re-rendering without the injected chunk on the next HMR update.

## Consequences
- Browser-side interception covers all apps regardless of framework — fetch and XHR are universal APIs
- SvelteKit `handleFetch` covers SSR requests that bypass the browser's `window.fetch` entirely
- Non-matching requests pass through with near-zero overhead (a single regex test per rule)
- Rules are fully dynamic; no rebuild or page reload needed to change interception behavior
- Mock responses can simulate arbitrary status codes, headers, and bodies for testing error states
- Dual-layer means rule logic is duplicated across client and server; discrepancies in regex behavior between environments could cause inconsistent interception
- XHR interception is inherently more complex than fetch — requires wrapping `open()`, `send()`, and property accessors on the XHR instance; edge cases (sync XHR, progress events) may behave differently
- The override approach cannot intercept requests made from Web Workers or service workers, which have their own global scope
- Blocked requests produce a `NetworkError` that existing error handlers must be prepared to catch — uncaught rejections may propagate to the console
