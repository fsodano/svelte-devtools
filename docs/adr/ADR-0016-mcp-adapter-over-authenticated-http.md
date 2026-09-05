# ADR-0016: MCP adapter over authenticated HTTP

## Status

Accepted (2026-09-05)

> Acceptance note (2026-09-05): Implemented and verified in the completed DevTools work. See the [completion audit](../validation/devtools-completion-audit.md) for browser, runtime, API, and MCP evidence and remaining boundaries.

## Context

Agents need discoverable operations with typed inputs. The existing HTTP API already has token authentication and project-scoped source access. Its runtime data comes from panel sync, so an MCP wrapper cannot truthfully present it as an independent live connection.

## Decision

Keep HTTP as the transport and add an MCP adapter. Expose status, bounded inspection, and source excerpts. Reject missing and stale runtime caches with actionable errors. Preserve cache timestamps. Use the live acknowledged command channel for mutation, as required by ADR-0010. Require an explicit panel session and mounted component ID. Report unknown delivery outcomes without retrying. Success acknowledges a live setter and active recording; snapshot capture occurs asynchronously through runtime events. Remote restore remains unsupported. Document setup and limitations in `docs/07_mcp.md`.

## Alternatives

- Replace HTTP with MCP: removes a useful script interface without fixing runtime collection.
- Return cached data without freshness checks: lets agents mistake old observations for current state.
- Add cache-only mutation tools: violates the live-truth contract in ADR-0010.

## Consequences

- Agents gain typed discovery without a second authentication model.
- Existing HTTP clients remain useful.
- Panel sync remains a dependency. Pagination does not bound the full transport payload or every individual value.

## Verification

Connect a real MCP SDK client over stdio to an instrumented fixture. Exercise discovery and each tool. Check unauthorized, never-synced, and stale-cache failures. Compare component results with the app DOM and HTTP API. Track evidence and unresolved bounds in D07, D08, D09, and D22.
