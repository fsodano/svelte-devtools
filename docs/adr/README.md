# Architecture Decision Records

> **Current implementation:** These records retain decisions and constraints from their original dates. For release 0.1.1 behavior, use the [API reference](../06_api.md), [MCP guide](../07_mcp.md), and [client guide](../04_client.md). Browser fetch mocks and acknowledged session-targeted state edits are implemented; historical proposals can describe earlier gaps.

This directory records the significant architectural decisions behind Svelte DevTools: why the plugin transforms `.svelte` files the way it does, why the runtime talks to the panel over `postMessage`, why state restore uses surgical diffs. Each record answers one question: given the constraints at the time, why did we build it this way?

ADRs are for developers contributing to this repo. They are the history of the design, not a tutorial. Read the record for an area before you change it, and write one when you change the design.

## Index

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-0001](./ADR-0001-event-driven-component-detection.md) | Detect components with a `MutationObserver` instead of polling | Accepted |
| [ADR-0002](./ADR-0002-debounced-state-change-batching.md) | Batch state changes into one rebuild per window | Accepted |
| [ADR-0003](./ADR-0003-birpc-rpc-communication-layer.md) | birpc-based RPC layer in `packages/bridge` | Accepted, removed (ADR-0011) |
| [ADR-0004](./ADR-0004-virtual-runtime-module-pattern.md) | Deliver the runtime as a virtual module | Accepted, superseded in practice |
| [ADR-0005](./ADR-0005-plugin-composition-pattern.md) | Split the plugin into six sub-plugins | Accepted, superseded in practice |
| [ADR-0006](./ADR-0006-inspect-state-tracking.md) | Track state with build-time `$inspect` injection | Accepted |
| [ADR-0007](./ADR-0007-network-interception-architecture.md) | Dual-layer fetch/XHR interception with mock rules | Accepted, partially implemented |
| [ADR-0008](./ADR-0008-state-reconstruction-surgical-json-diff.md) | Restore state via surgical JSON diff | Accepted |
| [ADR-0009](./ADR-0009-secure-agent-http-api.md) | Secure the Agent HTTP API | Accepted (2026-08-12) |
| [ADR-0010](./ADR-0010-agent-http-api-live-truth.md) | Agent HTTP API Must Report Live Truth | Accepted (2026-08-12) |
| [ADR-0011](./ADR-0011-remove-dead-code-plugins-bridge.md) | Remove Dead Code, Plugin Decomposition and Bridge Package | Accepted (2026-08-12) |
| [ADR-0012](./ADR-0012-stop-stubbing-app-navigation.md) | Stop Stubbing SvelteKit App Navigation | Accepted (2026-08-12) |
| [ADR-0013](./ADR-0013-restore-e2e-testing-integrity.md) | Restore E2E Testing Integrity | Accepted (2026-08-12) |
| [ADR-0014](./ADR-0014-publish-safe-workspace-dependencies.md) | Publish-Safe Workspace Dependencies | Accepted (2026-08-12) |
| [ADR-0015](./proposed/ADR-0015-shared-resizable-inspection-layouts.md) | Shared resizable inspection layouts | Proposed (2026-09-05) |
| [ADR-0016](./proposed/ADR-0016-mcp-adapter-over-authenticated-http.md) | MCP adapter over authenticated HTTP | Proposed (2026-09-05) |
| [ADR-0017](./proposed/ADR-0017-instance-safe-state-mutation.md) | Instance-safe state mutation | Proposed (2026-09-05) |

## Lifecycle

An ADR moves through these states:

```
Proposed → Accepted
         → Superseded (only after being Accepted)
         → Rejected
```

### Proposed

A new ADR starts as a proposal in `docs/adr/proposed/`. It stays there until it is accepted. The `proposed/` directory is created on demand when the first proposal is added.

- Proposal filename: `ADR-000N-<slug>.md`, where `N` is the next free number (see [Numbering](#numbering)) and `<slug>` is a kebab-case summary of the title. Proposals are numbered up front so they can be referenced during discussion. The next available number is `ADR-0018`; proposed records also reserve numbers.
- A proposal is a living document. Edit it freely while it is under discussion. Keep the discussion outcome in the record: add a short note about what changed and why, or fold it into the Context.
- Acceptance is not a vote count. A proposal is accepted when it describes the decision the team is actually going to implement, and the implementation owner signs off.
- A proposal can be rejected without ever being accepted; see [Rejected](#rejected).

### Accepted

On acceptance the proposal is:

1. Moved from `docs/adr/proposed/` to `docs/adr/`, keeping its number and filename.
2. Updated: `Status` becomes `Accepted`, and any discussion notes are folded into the sections.

Accepted does not mean "shipped as written". It means "this is the decision we are committed to". When reality diverges, the record is updated, not replaced. Existing records show the pattern: ADR-0002 carries an implementation note that the batching landed in the client store rather than the runtime, and ADR-0004 and ADR-0005 note that the shipped code took a different path than the one they describe.

### Superseded

When a newer decision replaces an accepted one, the older record is marked, not deleted:

- The old record's `Status` becomes `Superseded` and links to the replacing ADR with the words `Superseded by` followed by a link to that record.
- The new record should note `Supersedes ADR-000X` in its Context or Status so the pair is findable from either side.
- The old record stays in `docs/adr/`. Its history is the point of the record; removing it would erase why the newer decision was made.
- A record can be superseded in practice before the replacement exists. In that case set `Status` to `Accepted, superseded in practice` and explain in the implementation note what actually shipped (as ADR-0004 and ADR-0005 do). A formal replacement ADR can follow later.

### Rejected

A proposal that is explicitly declined gets `Status: Rejected`, with a one or two line reason and the date, and stays in `docs/adr/proposed/`. Recording the rejection preserves the rationale so the same option is not re-litigated blindly later. The only case where a proposal is deleted outright is when it never received any discussion or review.

## Numbering

- Sequential, zero-padded to four digits: `ADR-0001`, `ADR-0002`, `ADR-0008`, next is `ADR-0018`.
- The number is assigned when the proposal file is created in `docs/adr/proposed/`, so it can be referenced during discussion. It carries through acceptance unchanged.
- Numbers are never reused and never renumbered. A superseded record keeps its number; the gap in the sequence after a deleted rejected proposal is fine.
- The next number is always `max(existing) + 1`. Proposals in `docs/adr/proposed/` count toward the max, so two proposals can never claim the same number.

## Required Sections

Every ADR, proposed or accepted, has exactly these six sections, in this order:

| Section | What it must contain |
|---------|----------------------|
| **Status** | One of `Proposed`, `Accepted`, `Superseded`, `Rejected`, plus the optional dated implementation note (see [Evidence](#evidence)). |
| **Context** | The problem and the constraints that force a decision. Cite the concrete facts: what was tried, what broke, measured numbers. ADR-0001 starts from browser long-task warnings, ADR-0005 from an 832-line closure. |
| **Decision** | The chosen approach, stated as a decision, not a plan. Be specific enough that a reader can tell whether the code implements it. Include code shapes or signatures when they clarify. |
| **Alternatives** | The options considered and why they were rejected. ADR-0006 lists three approaches and dispatches two of them. Every serious alternative deserves a line; if only one approach was viable, say so. |
| **Consequences** | The trade-offs, stated as a bulleted list. Include both the gains (zero background CPU, typed RPC) and the costs (more complex than an interval, duplicated rule logic). |
| **Verification** | The concrete check that proves the decision holds. For this repo that usually means a named test, an HTTP API response, or a manual browser flow with the test app. Cite the file or command. |

Keep the prose concise and repo-specific. Name the actual files (`packages/client/src/lib/stores/devtools-store.svelte.ts`, not "the client store"), the actual numbers, the actual APIs. If a section would take more than a short paragraph, the ADR is probably trying to decide more than one thing.

## Evidence

A record is only as trustworthy as its evidence. Follow the pattern the existing records already use:

- **Implementation notes** go as a blockquote immediately under `## Status`, dated `(YYYY-MM-DD)`, stating what actually shipped and where, especially when that differs from the decision text. See ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0007, ADR-0008.
- **File paths** in backticks, so they are greppable.
- **Cross-ADR references** by number, inline: "the debounced batching in ADR-0002", as ADR-0006 does.
- **Measured facts** keep their source: a benchmark number, a console warning, a line count. When the source is a commit or PR, link it.
- Update the implementation note when reality moves, rather than rewriting the decision to match. The decision text records what was decided; the note records what happened.

## Writing a new ADR

1. Copy `TEMPLATE.md` to `docs/adr/proposed/ADR-000N-<slug>.md`, with the next free number.
2. Fill in all six sections. Keep it to one decision per record.
3. Keep it under discussion until it is accepted, then follow the [Accepted](#accepted) steps.
4. Update the [Index](#index) table and the ADR table in `docs/INDEX.md` when the status changes.
