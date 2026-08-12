# ADR-XXXX: Decision Title

> Copy this file to `docs/adr/proposed/ADR-000N-<slug>.md`, replacing `XXXX` in
> the title with the next free number and `<slug>` with a kebab-case summary of
> the title. The number is assigned when the proposal is created, so it can be
> referenced during discussion, and carries through acceptance unchanged.
> See `docs/adr/README.md` for the lifecycle, numbering, and evidence rules.

## Status

Proposed

> One of: `Proposed`, `Accepted`, `Superseded`, `Rejected`.
> A proposal under discussion stays `Proposed` in `docs/adr/proposed/`.
> On acceptance, change to `Accepted` and move the file to `docs/adr/`,
> keeping its number. When the shipped reality diverges from the decision, keep
> the status and add a dated implementation note here, as a blockquote, for example:
>
> > **Implementation note (YYYY-MM-DD):** Implemented in `packages/...`; the
> > original approach changed in this way. The *concept* is what shipped.

## Context

The problem and the constraints that force a decision. State what was tried or
is in place today, and why it does not work. Cite the concrete facts: measured
numbers, console warnings, files and line counts, commit or PR links.

> Example: the 100ms polling interval caused `"setInterval handler took Xms"`
> browser violations in apps with 20+ components (ADR-0001).

## Decision

The chosen approach, stated as a decision, not a plan. Be specific enough that a
reader can tell whether the code implements it. Include signatures, file
layouts, or code shapes when they clarify.

## Alternatives

The options considered and why they were rejected. One line per serious option
is enough; if only one approach was viable, say so explicitly.

> Example: ADR-0006 lists runtime rune hooking and DOM scanning, then rejects
> both before choosing `$inspect` injection.

## Consequences

The trade-offs, as a bulleted list. Gains first, then costs. Be honest about
what gets more complex or slower.

- Gain: ...
- Gain: ...
- Cost: ...
- Cost: ...

## Verification

The concrete check that proves the decision holds. Name the test file, the HTTP
API endpoint, or the browser flow that exercises it.

> Example: run `npx vitest run tests/runtime/`, then
> `curl -H "Authorization: Bearer $SVELTE_DEVTOOLS_TOKEN" \
> localhost:5173/__svelte-devtools/api/components` and confirm the new
> component appears with the expected state.
