# ADR-0015: Shared resizable inspection layouts

## Status

Accepted (2026-09-05)

> Acceptance note (2026-09-05): Implemented and verified in the completed DevTools work. See the [completion audit](../validation/devtools-completion-audit.md) for browser, runtime, API, and MCP evidence and remaining boundaries.

## Context

The user reported that Network request details are truncated and cannot be enlarged. Each inspection surface needs readable lists and details within an iframe whose dimensions vary. Independent fixed widths make the same defect recur across panels.

## Decision

Use one shared split-pane primitive for adjacent inspection regions. Support pointer and keyboard resizing, constrained dimensions, visible focus, and deliberate overflow. Follow `docs/design-guidelines.md` for semantic colors, density, settings behavior, and narrow layouts. The [completion audit](../validation/devtools-completion-audit.md) records the affected panels and checks under D26.

## Alternatives

- Increase fixed widths: fails when the host becomes smaller or the response grows.
- Add separate drag logic to each panel: duplicates accessibility and clamping behavior.
- Open all details in a modal: hides the request list and interrupts comparison.

## Consequences

- Developers can allocate space to the data they are inspecting.
- One primitive provides consistent keyboard and pointer behavior.
- Each consumer still needs explicit minimum sizes, scroll ownership, and narrow-layout checks.

## Verification

Rebuild the client and open Network in a real instrumented app. Select a long response. Resize the separator with pointer and keyboard input, shrink the host, and confirm that details and actions remain reachable. Repeat for every consumer. Preserve results in the [completion audit](../validation/devtools-completion-audit.md) (D26); source inspection alone is insufficient.
