# ADR-0019: Explicit synchronous SQLite observation

## Status

Accepted (2026-09-05)

> Acceptance note (2026-09-05): Implementation-owner review and the release validation are complete. PR #22 merged as `283daac`, tagged `v0.2.0`. See the [SSR/SQLite validation report](../validation/ssr-sql-observability-validation.md) and [completion audit](../validation/devtools-completion-audit.md).

## Context

HTTP traces do not explain database execution time. Transparent native-driver wrappers risk changing statement receivers, fluent methods, lazy iterators, transaction behavior, and error identity. Query values can expose application data.

## Decision

Export server-only `traceSqliteQuery(options, callback)`. Measure the actual synchronous callback with a monotonic clock and emit a child span through the active request context. Preserve its native return value and thrown error. Require `enabled`; disabled calls and calls outside a context emit nothing. Do not patch the database or add a native-driver dependency to the extension.

Omit statement text unless explicitly enabled. Capture only a bounded prepared template, never expanded bindings or result rows. Limit SQL to 4,096 characters and labels/safe error codes to 128. Report available row counts without reading value getters. Suppress observation failures. Use isolated test databases through `TODO_SQLITE_DB_PATH`.

## Alternatives

- Driver-wide proxies provide less explicit coverage but have a larger native-compatibility surface.
- Expanded verbose SQL can expose bound values and does not measure completion.
- Automatic transaction or iterator instrumentation would imply behavior this synchronous wrapper does not provide.

## Consequences

- Applications choose which calls and templates to observe.
- Async operations, iterator consumption, transaction boundaries, and other drivers require separate instrumentation.
- Literal SQL can still contain sensitive values; opt-in does not guarantee redaction.
- A successful query span does not prove transaction commit. Time Travel cannot undo database writes.

## Verification

Run `tests/vite-plugin/sqlite.test.ts` with Todo dependencies installed for native in-memory SQLite coverage. Run `scripts/verify-ssr-sql.mjs` for real CRUD and span parentage. See [the SSR/SQLite validation report](../validation/ssr-sql-observability-validation.md).
