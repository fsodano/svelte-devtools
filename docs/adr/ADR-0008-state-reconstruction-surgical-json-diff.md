# ADR-0008: Surgical JSON Diff for State Reconstruction

## Status
Accepted

## Context
Time-travel debugging captures snapshots of the entire component state tree at each meaningful state change. When the user restores a snapshot, the DevTools sends the full captured state object back to the runtime, which assigns it back to the component's `$state` variable.

In Svelte 5, `$state()` creates a reactive proxy around the initial value. Assigning a completely new object to a `$state` variable (`component.state = snapshot`) replaces the entire proxy reference. This has two cascading effects:

1. **Broken child bindings** — any child component or `$derived` that references a nested property of the state loses its connection to the original proxy. The new proxy is a different object, so reactive chains are severed.

2. **False change signals** — even when only one field changed, the entire tree is replaced, which can trigger unnecessary re-renders across the component graph.

The initial approach of deep-cloning and full reassignment works for simple flat state but breaks down with nested reactive objects, arrays, and Svelte 5's proxy-based `$state` semantics. The deeper the nesting, the more severe the disconnection.

## Decision
Instead of full object reassignment, calculate the difference between the current active state and the target snapshot using a shallow-to-moderate-depth JSON diff algorithm. Apply only the changed values in-place to the existing `$state` proxy via a path-targeted mutator called `surgicallyApplyDiff`.

The algorithm works as follows:

1. Walk both the current state and the target snapshot in parallel, comparing values at each key path.
2. For primitive changes (string, number, boolean, null) — assign the new value directly to the existing proxy property: `proxy[key] = newValue`.
3. For object/array changes — recurse into the existing proxy reference instead of replacing it. This keeps the proxy identity intact.
4. For added keys — insert into the existing proxy.
5. For removed keys — `delete proxy[key]`.

The diff application never creates a new top-level proxy. It mutates the existing one property by property, preserving all reactive bindings and child connections. Arrays are handled by splicing elements rather than replacing the array reference.

## Consequences
- Svelte 5 reactivity paths remain intact — no child proxies or `$derived` bindings are disconnected
- Only changed values are written, making restore operations O(changed fields) instead of O(total state)
- More complex than full reassignment — requires maintaining a diff engine and a surgical mutator
- Diff depth must be configurable to handle deeply nested state without performance degradation
- Arrays still present an edge case: large array replacements benefit from a length check before deciding to splice element-by-element
- Snapshot size is unaffected (we still store full snapshots), but restore cost is proportional to the diff, not the snapshot size
- Time-travel across many steps (100+ snapshots) benefits from incremental diffs between adjacent snapshots rather than always diffing against the current state
