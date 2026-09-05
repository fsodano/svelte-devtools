# Svelte analyzer review

Review date: 2026-09-05. Tool: official `@sveltejs/mcp` 0.1.26, `svelteAutofixer`, targeting Svelte 5.

## Execution and source handling

The review covers all 27 changed Svelte components and rune modules from the 0.1.0 release, including the follow-up Network retention fix. The [raw report](./svelte-autofixer-results.json) records the exact source hashes and findings. The final run reports two rule-level issues and 46 advisory suggestions. Both rule-level issues have contextual dispositions below. No compiler error was reported.

The installed CLI imports the official local compiler, analyzer, and ESLint implementation. Its startup also requests the public documentation catalog at `https://svelte.dev/docs/experimental/sections.json`. The earlier description of this as an external source analyzer was incorrect. Automatic approval review had rejected a proposed bulk run as source transmission.

For this review, the public catalog was downloaded separately. The exported `svelteAutofixer` handler ran inside the network-restricted sandbox. A fetch guard served only that cached catalog and rejected all other requests. No application source was uploaded, and no analyzer rule was disabled.

For normal local use, run:

```bash
npx -y @sveltejs/mcp@0.1.26 svelte-autofixer packages/client/src/components/NetworkDesk.svelte --svelte-version 5
```

The CLI can require internet access for its documentation catalog even though source analysis is local. Do not interpret a catalog connection failure as a completed code review.

## Findings and disposition

| Finding | Review decision |
|---|---|
| Assets link requires SvelteKit `resolve()` | Not applicable. The panel is a plain Vite application. The link opens an absolute resource-timing URL, not a SvelteKit route. |
| Sidebar `{@html}` may permit XSS | No current injection path. The input is a closed, source-defined list of SVG literals. It does not contain runtime, API, or user input. Revisit this decision if icon data becomes dynamic. |
| Graph effects and element binding | Required integration with the external graph renderer. The effect watches topology/container changes and destroys the renderer during cleanup. |
| Tree effects and element binding | These synchronize search and measure the scroll viewport. The length marker is redundant reactive bookkeeping but does not create a feedback loop. Replacing it is optional cleanup, not a correctness fix. |
| JsonTree literal interpolation | Intentional rendering of braces in JSON previews. Cosmetic advice. |
| Network effects and local collection usage | History accumulates events over time; it is not a pure function of one current payload. Polling/listener cleanup and untracked reads avoid a feedback loop. Review did expose unbounded client retention and clear markers; the follow-up fixes those and adds production regressions. |
| SplitPane element binding | Used to read geometry during pointer resizing. An attachment is optional and would raise the compatibility requirements. |
| Time Travel effect and playback state | The effect owns a timer and clears it. The timer callback stops playback when no redo remains. This is an external scheduler, not a derived calculation. |
| ErrorBoundary callbacks | The effect installs and removes global error handlers. State assignments run later in those handlers. This component is currently unused. Before adopting it, prefer a real Svelte boundary for descendant render errors and normalize missing `event.error`. |
| Rune-store Map/Set suggestions | These are temporary indexes, deduplication sets, or imperative motion bookkeeping. They are not template state and do not require reactive collections. |

The analyzer's generic suggestions are review prompts. This record does not claim the raw report contains zero findings. Preserve the report alongside these decisions.

## Follow-up validation

All five workspaces build. Svelte check reports zero errors and warnings. The bounded-worker unit run passes 532 tests in 34 files. All 12 Chromium tests pass, including 525 real fetches, the 500-row history cap, authenticated API visibility, and Clear behavior across polls. All five package dry runs pass. No test timeout was increased.
