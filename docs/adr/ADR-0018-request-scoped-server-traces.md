# ADR-0018: Request-scoped server traces

## Status

Accepted (2026-09-05)

> Acceptance note (2026-09-05): Implementation-owner review and the release validation are complete. PR #22 merged as `283daac`, tagged `v0.2.0`. See the [SSR/SQLite validation report](../validation/ssr-sql-observability-validation.md) and [completion audit](../validation/devtools-completion-audit.md).

## Context

Method/path deduplication merged concurrent requests. SvelteKit internal fetches and database work need direct request relationships. The Vite plugin and SSR loader can evaluate the same module separately, and one process can host multiple dev servers.

## Decision

Carry `traceId`, `spanId`, and an owner-specific emitter in AsyncLocalStorage. Share that context through a versioned global symbol across module evaluations. Give child fetches and SQL operations fresh span IDs and explicit parent IDs. Mark Kit-handled requests in context so generic middleware does not duplicate their root. Store events per dev server and dispose only owned interception on server close, including middleware mode. Preserve the native response/error path while collecting bounded previews asynchronously. Inject DevTools scripts once across streamed HTML chunks.

## Alternatives

- URL/time-window matching cannot distinguish concurrent requests or prove parentage.
- A process-wide event buffer leaks observations between servers.
- Awaiting complete body previews blocks streaming and can retain unbounded data.

## Consequences

- Network, HTTP, and MCP can follow the same request identities.
- A retained window can omit a parent; the UI must not fabricate relationships.
- Request duration measures resolution, not necessarily stream completion.
- Lifecycle and streaming tests are required when changing interception.

## Verification

Run `scripts/verify-ssr-sql.mjs` for concurrent SSR, internal fetches, streaming, and UI/API/MCP correlation. Run `scripts/verify-production.mjs` for production isolation. Preserve release evidence in [the SSR/SQLite validation report](../validation/ssr-sql-observability-validation.md).
