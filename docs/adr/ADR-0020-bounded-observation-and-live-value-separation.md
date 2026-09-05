# ADR-0020: Bounded observation and live-value separation

## Status

Accepted (2026-09-05)

> Acceptance note (2026-09-05): Implementation-owner review and the release validation are complete. PR #22 merged as `283daac`, tagged `v0.2.0`. See the [SSR/SQLite validation report](../validation/ssr-sql-observability-validation.md) and [completion audit](../validation/devtools-completion-audit.md).

## Context

A 552,896-byte sync exceeded the browser beacon queue limit and left 1,000 runtime instances absent from the API. Function, BigInt, and cyclic values could break initial serialization. Network history lacked a consistent client/server bound. Serialized previews are not safe replacement values for live state.

## Decision

Keep display serialization separate from editability and restore values. Render unsupported values safely without invoking functions or value getters. Use actual live values to determine writable JSON state. Send panel sync through authenticated fetch with one request in flight and a request deadline. Retry observation on a later poll rather than treating a failed delivery as an empty app.

Bound each observation surface explicitly: the server buffer and runtime timeline retain 1,000 events; Network retains 500 combined rows. Expire dismissed IDs as source history leaves retention. MCP limits transfer/output separately and requires fresh session-matched runtime caches.

## Alternatives

- JSON conversion alone drops values or invokes application behavior.
- Beacon-only sync cannot reliably carry larger application snapshots.
- Unlimited history shifts debugging overhead into the application being inspected.

## Consequences

- Previews can be incomplete and must not be treated as live setter inputs.
- Retention limits differ from API pagination and transport limits.
- Panel-independent runtime collection remains outside this decision.
- Large-instance behavior needs real-app checks, not only mocked payload tests.

## Verification

Run production store/runtime regressions, the mixed Network retention browser test, and `scripts/verify-stress.mjs`. Historical measurements and compatibility limits remain in [the completion audit](../validation/devtools-completion-audit.md); they are local observations, not performance guarantees.
