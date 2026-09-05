# Historical verification record: SSR and SQLite observability

This report preserves the original audit findings and test evidence from 2026-09-05. Statuses and release notes below describe those runs; they are not a current work queue or a claim about later releases. Durable design choices are recorded in the architecture decisions.


Final status: verified and merged in PR #22 as `283daac`, tagged `v0.2.0`. See the final release result below.

Scope: implementation PR #22, following README PR #21.

## Expected behavior

SvelteKit must render and hydrate normally with DevTools enabled. Every observed server request must have a stable trace identity. SQLite spans must measure real synchronous execution, preserve application behavior, and belong to the correct request. Developers and MCP clients must inspect the same trace data. Production builds must remain inactive.

## Verified discrepancy coverage

- S1: HTML injection can repeat across streamed chunks. Inject once per response, preserve chunk order, and test incomplete chunks and final fallback.
- S2: Method/path deduplication conflates concurrent requests. Use request context identity; verify concurrent same-route isolation.
- S3: Generic middleware buffers unbounded end chunks and misses writes. Bound previews while retaining accurate byte counts and streaming behavior.
- S4: Server globals, intervals, and fetch interception lack scoped cleanup. Dispose owned hooks safely and test repeated server lifecycle.
- S5: Server fetches lack request parentage and failed-fetch spans. Correlate actual execution and preserve original responses/errors.
- S6: SQLite execution is invisible. Add an opt-in server-only synchronous query wrapper, measuring actual get/all/run execution with IDs, operation, statement, duration, result count, and error details.
- S7: SQL observation must not expose bindings or rows by default, invoke getters, or change native return/error identity. Bound text and document explicit capture controls.
- S8: Todo uses a developer database for all runs. Support an isolated database path and use temporary databases for validation.
- S9: Todo actions return success HTTP statuses for invalid input and accept malformed IDs. Use proper SvelteKit failures and verify valid/invalid CRUD with and without JavaScript.
- S10: Network server polling expects the wrong response shape. Use the authenticated canonical API and test real server rows.
- S11: UI cannot explain request/query relationships. Add a navigable trace view with correlated spans, readable SQL, timings, errors, bounded-data indicators, and resizable details. SQL must not expose browser mock actions.
- S12: Clear, retention, polling, and teardown must work with server traces. Verify no replay, duplicate rows, overlapping polls, or stale updates after disposal.
- S13: HTTP/MCP lack tested SQL visibility. Verify both return the same IDs and spans, with existing authentication and response limits preserved.
- S14: SSR coverage does not prove initial HTML, hydration, navigation, actions, redirects, errors, data responses, and streams together. Add real Kit/Todo checks and production builds.
- S15: Active docs describe missing SQL visibility and server UI. Update README, architecture/API, skills, fixture guides, and design decisions after real-app validation.
- Publication gate still pending at this evidence snapshot (S16): Release packaging must export the adapter and coherent package versions. Run build, types, unit, browser, stress, and pack gates; review and merge a separate PR before npm publication.

## Contract

Use AsyncLocalStorage for request parentage, never URL/time guesses. Events retain the existing id/type/timestamp/duration/data envelope. Add traceId, spanId, parentSpanId to server event data. SQL uses type `server:sql`, data fields database, operation, statement, statementTruncated, rowCount, error, and status. Durations are milliseconds measured with performance.now(). No expanded SQL bindings or result rows are collected. The opt-in wrapper executes synchronously and does not intercept global database APIs.

## Evidence

The following results were recorded during the implementation audit.

### Local verification, 2026-09-05

- All five workspaces build at 0.2.0. Root Svelte check: zero errors and warnings.
- 561 unit tests in 38 files pass with two workers. Includes real native SQLite, concurrent HTTP contexts, streaming previews, per-server storage, cleanup, and client trace/retention adapters.
- `verify-ssr-sql.mjs`: nine groups passed using actual Kit/Todo servers, Chromium, authenticated API, and MCP stdio. Checks include JavaScript-disabled forms, enhanced CRUD, initial HTML, hydration/navigation, data/redirect/error/upload/SSE preservation, query parentage and statement privacy, matching UI waterfall, and resizing.
- Kit and Todo production builds succeed. `verify-production.mjs` passes against both real preview servers: SSR/hydration work; DevTools assets, dock, globals, and API are absent.
- 1,000-component stress check passes. Final runtime/API/panel instance counts are zero; observed unmount plus sync was 1.27 seconds. This is a local observation, not a performance guarantee.
- Official local Svelte analyzer: new SSR fixture and updated Todo page have no issues. Three existing Todo effect/ref suggestions were reviewed; the effect focuses/reset fields after successful enhanced actions. New server detail has no analyzer issues.
- Independent reviews fixed proxy value-getter observation and same-timestamp waterfall ordering.
- Existing mixed-network browser test now accounts for real server rows and polls the canonical endpoint. Its 500-row and no-replay checks remain intact. Full CI gates are required before merge.

### Publication follow-up

A clean-package audit found a pre-existing runtime asset path that only works inside the monorepo. The final npm publication PR must fix this, add package README/license/metadata, and verify actual packed-package consumer installs before publishing. npm authentication currently returns 401; login has been requested while the remaining work continues.

## Final release result — 2026-09-05

[PR #22](https://github.com/fsodano/svelte-devtools/pull/22) merged as `283daac` and was tagged `v0.2.0`. The completed gate includes 561 unit tests, all 12 browser tests, nine SSR/SQLite verification groups, production preview isolation, the 1,000-component stress check, and package validation. Both GitHub CI jobs passed. This closes the implementation and release-tag checks recorded above; it does not mean the packages were published to npm.

The npm packaging and authentication work described in the publication follow-up belongs to a separate release task. Historical timing measurements remain observations from the recorded machine, not guarantees.

Accepted decisions: [request-scoped traces](../adr/ADR-0018-request-scoped-server-traces.md), [explicit SQLite observation](../adr/ADR-0019-explicit-synchronous-sqlite-observation.md), and [bounded observation](../adr/ADR-0020-bounded-observation-and-live-value-separation.md).
