# ADR-0017: Instance-safe state mutation

## Status

Proposed (2026-09-05)

> Implementation note (2026-09-05): Instance identity and snapshot matching changes are implemented. The user explicitly authorized the identity fix and time-travel regression checks. Production compiler and store regressions pass. Browser checks have exercised repeated-instance editing and undo/redo. Track the final integrated run and remaining cases in D01, D03, and D11.

## Context

A real Pokédex run rendered 20 `PokemonCard` instances but exposed one DevTools entry. A file-level identity cannot address sibling state independently. Inspector editing and snapshot restore depend on the same target identity.

## Decision

Separate instance identity from source metadata. Address registry entries, live setters, and snapshots by instance ID. Match exact instances first. If an original instance is gone, allow source-based remapping only when both snapshot and live source identify one unique instance. Reject ambiguity instead of editing a sibling. Apply inspector changes through the live setter and normal recording path. Keep derived values read-only. For HTTP and MCP edits, require an explicit live panel session and an acknowledgement from the setter path. Enable recording before editing and retain a baseline. Capture the edited snapshot asynchronously from normal runtime events.

## Alternatives

- Continue using filenames as IDs: merges repeated components and makes edits ambiguous.
- Match repeated components by array position: can select the wrong instance after sorting or removal.
- Add timing gates around restore: hides events without establishing correct identity and conflicts with project rules.

## Consequences

- Repeated components can be inspected and edited independently.
- Source filenames remain useful for editor navigation without becoming mutation targets.
- Remounts can make a snapshot unrestorable. An explicit error is preferable to modifying the wrong component.
- The identity mechanism requires a tested Svelte version floor; `$props.id()` requires Svelte 5.20 or newer.

## Verification

Run the Pokédex fixture and confirm 20 distinct card IDs. Edit one writable instance value and check the DOM, API, siblings, undo, and redo. Exercise ambiguous remounts and confirm failure. Run the exact Spring counter procedure from `AGENTS.md`: 2/2 after increment, 1/2 after undo, and 2/2 after redo with counter 1. Production-code tests and browser evidence are both required.
