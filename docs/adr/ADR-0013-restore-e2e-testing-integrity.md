# ADR-0013: Restore E2E Testing Integrity

## Status

Accepted (2026-08-12)

> **Implementation note (2026-08-12):** Shipped. `tests/e2e/devtools.test.ts`
> was deleted; its tests now import the production modules directly in
> `tests/vite-plugin/migration-analyzer.test.ts`,
> `tests/vite-plugin/server-events.test.ts`, and
> `tests/runtime/runtime-effects.test.ts`, so no production module is duplicated
> in a test file. Real browser coverage landed: `playwright.config.ts` at the
> repo root with its own `testDir`, plus `tests/e2e/global-setup.ts`,
> `tests/e2e/devtools.spec.ts`, and `tests/e2e/navigation.spec.ts`, run only via
> `npx playwright test` and never picked up by the Vitest `include` glob in
> `vitest.config.ts`. Verified: `npm test` passes 440 Vitest tests, and
> `npx playwright test` passes 4 browser tests against the test app on port
> 5173. The error utility `packages/vite-plugin/src/utils/error.ts` and its
> test were removed with the dead-code cleanup (ADR-0011). The utility had
> zero production importers, so it has no replacement test and must not be
> restored.

## Context

The project guide (`AGENTS.md`) describes an E2E testing story: a `tests/e2e/` directory for Playwright tests, a "Browser Testing Workflow (Playwright)" section, and a "Mandatory Time Travel Verification Procedure". The directory at `tests/e2e/` contains exactly one file, `devtools.test.ts`, and it is not an E2E test. It launches no browser, starts no dev server, and runs under Vitest with happy-dom. The label "e2e" is a claim the file does not honor.

The file is three inline replicas of production logic plus a few shape checks on locally constructed objects:

- `tests/e2e/devtools.test.ts:5-58` reimplements `MIGRATION_PATTERNS` and `analyzeMigration` from `packages/vite-plugin/src/migration-analyzer.ts:21-89`.
- `tests/e2e/devtools.test.ts:224-233` reimplements `getServerEvents` from `packages/vite-plugin/src/server-events.ts:34-43`.
- `tests/e2e/devtools.test.ts:300-313` reimplements `handleEffect` from `packages/runtime/src/index.ts:290`.

The copies have already drifted from the modules they imitate. The production migration analyzer has 11 patterns, including `$store` and `beforeUpdate/afterUpdate`; the replica at `devtools.test.ts:5-15` has 9. The `<slot>` migrated rule requires `$props` in production but not in the replica, and the `$: reactive` regexes differ. The runtime `handleEffect(componentId, key, runeName, filename)` is replicated as `handleEffect(componentId, key, dependencies)` pushing a `{ dependencies }` payload. A test that certifies a stale copy of a function says nothing about the real function; the suite goes green while the production module breaks.

This is the same masking pattern ADR-0010 documented for `/api/migration`: a test that codifies a false claim instead of testing the real behavior (`tests/vite-plugin/server-api.test.ts:221-234` asserted the buggy empty-registry response as expected). Here the false claim is the "e2e" label on a suite that never touches a browser.

One configuration detail makes the situation worse than a mislabeled file. `vitest.config.ts:5` sets `include: ['tests/**/*.test.ts']`, so `tests/e2e/devtools.test.ts` is swept into the unit suite automatically. There is no separate Playwright config, no `testDir` boundary, and no browser runner anywhere in the repo. The E2E claim lives only in prose.

## Decision

Three changes, smallest first.

**1. Move the honest unit tests to package test locations and import the production modules.**

`tests/e2e/devtools.test.ts` is deleted as a unit file, and its tests are relocated, importing the real code instead of copying it:

- Migration analyzer tests move to `tests/vite-plugin/migration-analyzer.test.ts`, importing `analyzeMigration` from `packages/vite-plugin/src/migration-analyzer.ts`.
- Server events tests move to `tests/vite-plugin/server-events.test.ts`, importing `getServerEvents` and `clearServerEvents` from `packages/vite-plugin/src/server-events.ts`.
- Runtime effect tests move to `tests/runtime/runtime-effects.test.ts`, importing from `packages/runtime/src/index.ts`.

Tests that only assert on locally constructed objects (the AgentResponse shape checks and the console-log gating checks) either move to the package that owns the type or are deleted. No production module is duplicated inside a test file anymore. The migration expectations may need reconciliation against the real 11-pattern module; a failing expectation is the correct outcome, not a defect.

**2. Remove the fake e2e claim.**

`tests/e2e/` stays reserved for actual browser tests and holds nothing until one exists. The claim that the current suite is browser coverage is withdrawn. The `AGENTS.md` sections describing the e2e workflow are updated in a separate, doc-only follow-up; that edit is out of scope for this record's execution.

**3. Add one Playwright smoke test later, wired separately.**

When a browser test lands, it gets its own `playwright.config.ts` (repo root or `tests/e2e/`), a `testDir` of its own, and the `@playwright/test` runner. It is never picked up by `vitest.config.ts:5`. Scope is one test: start `tests/apps/svelte` on port 5173, load `http://localhost:5173/`, authenticate with the manual token dialog, open the DevTools panel, and assert the counter component appears in the tree. It runs only via `npx playwright test`, and it fails cleanly when no dev server is running.

## Alternatives

- **Keep the replicas and document the drift.** Rejected: a passing test against a copy is worse than no test, because it certifies something that is not the shipped code. The drift at `devtools.test.ts:5-15` is already visible and will only grow.
- **Convert `tests/e2e/devtools.test.ts` into a real Playwright suite in place.** Rejected for now: it has no test-app wiring, no auth handling, and the time-travel flow in `AGENTS.md` is long and flaky. One bounded smoke test is a smaller first step that can grow later.
- **Delete the file and write nothing.** Rejected: the migration scoring rules are still worth testing, just against `packages/vite-plugin/src/migration-analyzer.ts` rather than a copy.

## Consequences

- Unit tests finally exercise the production modules directly. A real regression in `migration-analyzer.ts` or `server-events.ts` fails the suite instead of passing against a stale replica.
- `tests/e2e/` becomes honest: empty until a real browser test exists, instead of holding a mislabeled unit file.
- Roughly fifty lines of duplicated logic disappear, along with the recurring cost of keeping copies in sync with their sources.
- Cost: migration expectations written against the 9-pattern replica may fail against the real 11-pattern module until reconciled. That failure is the intended signal.
- Cost: `npm test` no longer implies any browser coverage. Until the Playwright smoke test lands, the repo has zero real E2E, which is an accurate statement of today's state.
- Cost: the AGENTS.md workflow text temporarily documents a browser testing procedure the repo does not contain. The follow-up doc edit fixes that.

## Verification

Two suites with distinct pass criteria, and a doc-honesty grep.

**Unit suite (Vitest, runs under `npm test`):**

- `npx vitest run tests/vite-plugin/migration-analyzer.test.ts tests/vite-plugin/server-events.test.ts tests/runtime/runtime-effects.test.ts` passes, with every test importing its production module rather than declaring a replica.
- `tests/e2e/devtools.test.ts` no longer exists, and no `tests/e2e/*.test.ts` file matches the `include` glob at `vitest.config.ts:5`.

**Browser suite (Playwright, added later):**

- `npx playwright test` passes only when `tests/apps/svelte` is running on port 5173: it loads the page, authenticates via the manual token dialog, opens the DevTools panel, and asserts the counter component appears in the component tree.
- The suite fails with a clear connection error when no dev server is running, proving it does not run under happy-dom.
- `npx playwright test` is not reachable from `vitest.config.ts:5`; the two runners are wired independently.

**Doc honesty grep:**

- No file under `AGENTS.md` or `docs/` describes `tests/e2e/devtools.test.ts` as browser coverage once the follow-up doc edit is done.
