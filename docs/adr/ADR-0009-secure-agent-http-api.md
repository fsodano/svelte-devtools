# ADR-0009: Secure the Agent HTTP API

## Status

Accepted (2026-08-12)

> **Implementation note (2026-08-12):** Shipped. `packages/vite-plugin/src/token.ts`
> generates a per-run bearer token (printed to the terminal next to the Manual
> Auth Token, and read from `SVELTE_DEVTOOLS_TOKEN`). `packages/vite-plugin/src/http-guard.ts`
> enforces it on every `/api/*` request (`401` without a valid token), validates
> the `Host` header against localhost/user-configured hosts (`403` otherwise),
> and replaces the wildcard CORS with origin allow-listing plus `Vary: Origin`.
> `packages/vite-plugin/src/server-api.ts` dropped `Access-Control-Allow-Origin:
> *` from `json()`, and `/api/source` now realpath-canonicalizes and confines
> reads to the project root (`403` outside it). The panel client sends the token
> on every API request (`packages/client/src/lib/api.ts`), so `/api/sync` keeps
> working. Verified by the auth/CORS/traversal/Host cases in
> `tests/vite-plugin/server-api.test.ts` and the curl checks under Verification.

## Context

The plugin exposes an HTTP API at `/__svelte-devtools/api/*` for agents and
scripts to inspect a running Svelte app. Today every endpoint has two
properties that make it dangerous:

1. **Wildcard CORS.** The `json()` helper sets `Access-Control-Allow-Origin: *`
   on every response, including errors
   (`packages/vite-plugin/src/server-api.ts:51`). Any web page the developer
   visits can fetch these endpoints cross-origin and read the responses.

2. **No authentication.** `handleApiRequest` performs no auth check on any
   path (`packages/vite-plugin/src/server-api.ts:72-315`). The Vite DevTools
   dock authorization protects the DevTools panel session, not these HTTP
   endpoints.

The exposure is not merely read-only. Three endpoints mutate server state
without authentication:

- `POST /api/set-state` rewrites cached component state
  (`packages/vite-plugin/src/server-api.ts:189-208`). A malicious page can
  craft a payload and mutate what the panel and other agents see.
- `POST /api/sync` accepts arbitrary `components`, `timeline`, `remote`,
  `snapshots`, and `branches` arrays and replaces the cache wholesale
  (`packages/vite-plugin/src/server-api.ts:240-255`). This is a cache
  poisoning primitive with no validation and no auth.
- `DELETE /api/server-events` clears the server trace buffer
  (`packages/vite-plugin/src/server-api.ts:147-149`).

The read side is worse than it looks. `GET /api/source` reads files from disk
(`packages/vite-plugin/src/server-api.ts:211-237`). The boundary check at line
227 has two holes:

```typescript
if (!resolved.startsWith(root) && !resolved.includes('/svelte-dev-extension/')) {
```

- `startsWith(root)` is a prefix check, so a sibling directory that shares the
  project root as a prefix (for example `/app/project-evil`) passes.
- The `includes('/svelte-dev-extension/')` clause is an escape hatch that
  admits any absolute path on the machine containing that substring,
  including other checkouts and unrelated directories.

Combined, an attacker who can reach the dev server can read source code,
network traces (which may contain request bodies and secrets), component
state, and, through the escape hatches, files outside the project. The
documented API surface confirms the intent: `docs/06_api.md:307` states that
all endpoints "return JSON with CORS headers (`Access-Control-Allow-Origin:
*`)".

Because the dev server listens on localhost, the practical attack is a
malicious website: wildcard CORS lets it read responses, and the unauthenticated
POSTs let it write state without any preflight. DNS rebinding is a secondary
vector: a site can point `fetch` at `localhost` even without CORS cooperation,
so relying on same-origin assumptions alone is not defense in depth.

## Decision

Secure the agent HTTP API in four layers, in order of importance:

1. **Authenticate every `/api/*` request.** Require a bearer token on all
   methods (GET, POST, DELETE) for all paths handled by `handleApiRequest`.
   The token is generated per dev-server run, printed to the terminal (next to
   the existing Manual Auth Token), and also read from the
   `SVELTE_DEVTOOLS_TOKEN` environment variable so scripts and agents can
   consume it. Requests without a valid token receive `401` with no data in
   the body. The panel client sends the token on its own requests, so the UI
   keeps working. Do not reuse the Vite DevTools manual auth token: it is
   single-use and invalidated by new WebSocket handshakes (see AGENTS.md),
   which makes it unusable for HTTP polling loops.

2. **Remove the wildcard CORS header.** Stop emitting
   `Access-Control-Allow-Origin: *` in `json()` (`server-api.ts:51`). Instead,
   reflect an allowed origin only when the request's `Origin` header matches a
   strict allow-list: `http://localhost:*`, `http://127.0.0.1:*`, and any
   origins explicitly configured by the user. Always pair the response with
   `Vary: Origin`. Requests with no `Origin` header (curl, server-to-server)
   get no CORS header at all. Unrestricted CORS is not acceptable in any form.

3. **Strict source allow-listing for `/api/source`.** Resolve the requested
   file, canonicalize it with `fs.realpath`, and require that the canonical
   path be inside the project root (computed via `path.resolve(process.cwd())`)
   or inside an explicitly configured allow-list of directories. Drop the
   `includes('/svelte-dev-extension/')` escape hatch and the
   `startsWith(root)` prefix check at `server-api.ts:227`. Return `403` for
   anything outside the allow-list, including traversal attempts.

4. **Validate the `Host` header as defense in depth.** Reject requests whose
   `Host` header is not `localhost`, `127.0.0.1`, `[::1]`, or a
   user-configured host, returning `403`. This blunts DNS rebinding: a
   rebinding attack presents the attacker's hostname in `Host`, which now
   fails before the request reaches any handler, authenticated or not.

## Alternatives

- **Do nothing.** Rejected. Any website the developer visits can read source
  code and traces and mutate state. The cost is not hypothetical and the fix
  is cheap.
- **Bind the dev server to 127.0.0.1 only.** Rejected as a complete solution.
  It reduces remote exposure but does nothing against the primary threat,
  which is a malicious page in the developer's own browser. It also breaks
  legitimate LAN access for anyone who wants it.
- **Rely on the Vite DevTools dock auth.** Rejected. That authorization gates
  the WebSocket panel session; the HTTP endpoints are plain HTTP and never see
  it. Extending it would require the single-use token problem to be solved
  first (see AGENTS.md, "The Manual Auth Token is single-use").
- **Same-origin check only, no token.** Rejected. Without a token, an
  attacker who triggers a preflight-less request (a form POST or an image
  load) can still hit mutating endpoints, and DNS rebinding defeats
  same-origin checks entirely.
- **Origin allow-listing only, no auth.** Weaker than the chosen approach. It
  fixes the read side for browsers but leaves non-browser clients (any local
  process, or curl) fully unauthenticated, and it does not address rebinding.
  Used here only as a component of the full decision, never alone.

## Consequences

- **Positive.** Source code, network traces, component state, and snapshots are
  no longer readable by arbitrary websites. Cache poisoning via `/api/sync` and
  state mutation via `/api/set-state` require the token. Source reads are
  confined to the project root. DNS rebinding is met with a `Host` check.
- **Breaking change for agents.** Every curl workflow and scripted agent that
  calls the API must now send the token (header or query parameter). This
  affects the examples in `README.md` ("Agent API"), `docs/06_api.md` (HTTP
  API section, including the claim at line 307), `docs/02_vite-plugin.md`,
  and the `AGENTS.md` HTTP API verification workflow.
- **The panel client must carry the token.** `POST /api/sync` from the
  DevTools iframe is same-origin but still needs the token, so the client
  build must thread it through. Until then, the panel's state sync silently
  fails once auth lands, so client and server changes ship together.
- **Slightly more operational friction.** Users who automate against the API
  must set `SVELTE_DEVTOOLS_TOKEN` or parse it from the terminal. That is the
  intended trade: the token is per-run and printed where the Manual Auth
  Token already is.
- **Behavioral contract change.** `docs/06_api.md:307` currently documents
  wildcard CORS. This ADR explicitly reverses that contract.

## Future Work

The decision above is the target design. Implementation is explicitly future
work and is not part of this document. The work items, once approved:

1. Add a token store and per-run generation in the vite-plugin; wire the
   auth check into `handleApiRequest` before the route switch.
2. Replace the CORS header logic in `json()` with the allow-list reflection
   plus `Vary: Origin`.
3. Rework `/api/source` path resolution: realpath canonicalization,
   project-root allow-list, remove the line-227 escape hatch and prefix
   check.
4. Add `Host` header validation in the middleware that routes to
   `handleApiRequest`.
5. Update the client to send the token on all API requests, including
   `/api/sync`.
6. Extend `tests/vite-plugin/server-api.test.ts` with the cases under
   Verification.

## Verification

Executable checks that must pass after implementation (server running on
port 5173 against the plain Vite test app, token in `$SVELTE_DEVTOOLS_TOKEN`):

```bash
# 1. Unauthenticated GET is rejected
curl -i -s http://localhost:5173/__svelte-devtools/api/components | head -1
# expect: HTTP/1.1 401 Unauthorized

# 2. Unauthenticated mutating POST is rejected
curl -i -s -X POST http://localhost:5173/__svelte-devtools/api/sync \
  -H 'Content-Type: application/json' -d '{"components":[]}' | head -1
# expect: HTTP/1.1 401 Unauthorized

# 3. No wildcard Access-Control-Allow-Origin is ever emitted
curl -i -s http://localhost:5173/__svelte-devtools/api/ | grep -i 'access-control-allow-origin' || true
# expect: no line containing `Access-Control-Allow-Origin: *`

# 4. Path traversal and outside-project source reads are rejected
curl -s -o /dev/null -w '%{http_code}\n' \
  'http://localhost:5173/__svelte-devtools/api/source?file=../../../../etc/passwd'
# expect: 403
curl -s -o /dev/null -w '%{http_code}\n' \
  'http://localhost:5173/__svelte-devtools/api/source?file=../../../etc/passwd'
# expect: 403
curl -s -o /dev/null -w '%{http_code}\n' \
  'http://localhost:5173/__svelte-devtools/api/source?file=../svelte-dev-extension-evil/secret.txt'
# expect: 403 (sibling-prefix traversal must fail)

# 5. Host header validation rejects DNS rebinding
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example.com' \
  http://localhost:5173/__svelte-devtools/api/
# expect: 403

# 6. Authenticated requests still work
curl -s -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
  http://localhost:5173/__svelte-devtools/api/components | jq '.count'
# expect: a number (0 or greater)

# 7. Focused unit tests from the repository root
npx vitest run tests/vite-plugin/server-api.test.ts
# expect: all pass, including new cases for unauthenticated 401, CORS
# allow-listing, traversal 403, and Host validation
```

## Affected Documentation

- `docs/06_api.md` — HTTP API section; line 307's wildcard CORS claim must be
  rewritten to document the token and the allow-list behavior.
- `README.md` — "Agent API" section ("CORS-enabled, CI-safe") and the curl
  examples.
- `docs/02_vite-plugin.md` — API endpoint documentation, if it repeats the
  CORS or unauthenticated claims.
- `AGENTS.md` — HTTP API verification workflow, whose curl commands must send
  the token.

## References

- `packages/vite-plugin/src/server-api.ts:51` — wildcard
  `Access-Control-Allow-Origin: *`.
- `packages/vite-plugin/src/server-api.ts:72-315` — `handleApiRequest`, no
  authentication on any route.
- `packages/vite-plugin/src/server-api.ts:189-208` — unauthenticated
  `POST /api/set-state`.
- `packages/vite-plugin/src/server-api.ts:240-255` — unauthenticated
  `POST /api/sync` cache poisoning.
- `packages/vite-plugin/src/server-api.ts:211-237` and `:227` — `/api/source`
  file read with the `startsWith(root)` prefix check and the
  `includes('/svelte-dev-extension/')` escape hatch.
- `docs/06_api.md:307` — documented wildcard CORS contract.
- `tests/vite-plugin/server-api.test.ts` — existing API test suite to extend.
