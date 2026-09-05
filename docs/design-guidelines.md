# Svelte DevTools design guidelines

Use these guidelines when changing the developer panel or agent interface. They define the intended experience. They do not certify that every existing panel meets it. Track failures and validation in the [completion plan](plans/pending/devtools-completion.md).

## Product principles

Help a developer move from observation to explanation to a safe action. Help an agent perform the same investigation through typed tools. Both interfaces must describe the same application state and limitations.

Keep the interface compact, readable, and predictable. Use the Svelte accent to identify selection and primary actions. Reserve status colors for status. Do not imply success through a green badge when no data has arrived.

## Visual system

Use the semantic properties in `packages/client/src/theme.css`. Use `--bg-base`, `--bg-surface`, and `--bg-inset` for page, panel, and nested content. Use `--text-primary`, `--text-secondary`, and `--text-muted` for the corresponding text roles. Use the spacing and radius scales instead of adding a separate scale to each panel.

Use `--font-ui` for controls and labels. Use `--font-mono` for source, URLs, keys, values, and timestamps. Keep labels short. Preserve enough spacing for reliable pointer targeting even when rows are dense.

Check each surface in light, dark, and system themes. Normal text should meet a 4.5:1 contrast target. Essential control boundaries and focus indicators should meet a 3:1 target. Measure the rendered pair; a semantic token name does not establish contrast. Do not use color as the only indication of errors, selection, recording, or interception.

Settings must change visible behavior immediately. Persist supported preferences and reapply them when the panel opens. Font scaling must affect content and controls. Reduced motion must suppress nonessential animation. System theme must follow the system preference. If an option does nothing, remove or label it until it works.

## Resizable layouts

Use the shared `SplitPane.svelte` component for adjacent panes whose content competes for space. This includes request/detail, component tree/detail, and other master/detail layouts. A fixed detail width must not prevent reading a response or reaching an action.

Provide a visible resize handle with a useful pointer target. Make it a focusable separator with an accessible name, orientation, and current value. Support arrow-key resizing and a way to reset the size. Clamp dimensions when the host window shrinks. Keep both panes usable at the smallest supported size.

For flex and grid children, explicitly handle minimum dimensions and overflow. Use `min-width: 0` and `min-height: 0` where content must shrink. Give long source and JSON content an intentional scroll area. Keep detail headers and essential actions reachable. Do not hide content to make overflow disappear.

At widths where two panes cannot remain useful, provide a single-pane or stacked layout with a clear route back to the list. Test the real dock iframe as well as a wide standalone panel. Resizing the browser alone does not prove that a nested pane can resize.

## Interaction and feedback

Use native buttons and inputs where possible. All actions need a visible label or accessible name. Provide visible keyboard focus. Keep tab order aligned with reading order. A selected row must be distinguishable from a hovered row.

Show actionable errors near the failed operation. Preserve entered values after a failed save. Distinguish loading, no results, disconnected runtime, and stale data. Empty states should explain the next useful action without claiming that an unobserved application has no components or requests.

State whether an action has been requested, accepted, or confirmed. A source launch response means that the server accepted the launch; it does not prove that the editor displayed the file. Show launch failures and explain the `LAUNCH_EDITOR` configuration when needed.

## Component inspection and editing

Identify mounted components by instance ID. A filename identifies source, not an instance. Display the source filename even when detailed line metadata is absent. Open source through the authenticated development server. The server must validate the project boundary, including resolved symlinks. Use a file-level fallback when line information is absent.

Expose editing only for writable values supported by the runtime. Keep derived and non-JSON values read-only. Check the live value, because a serialized preview can hide a function or collection. Never initialize an unrepresentable value as `null`. Validate input before applying it and preserve the draft on failure. Route an edit through the live instance setter. Do not update only the panel cache or manufacture a successful result.

Saving an inspector or agent edit enables recording and captures a baseline for undo. Edited snapshots use normal runtime event capture. Undo and redo must restore the intended instance without creating an extra capture. When recording is paused, communicate that ordinary app changes are not recorded and that saving an edit enables recording. Reject ambiguous remapping after an instance disappears instead of selecting an arbitrary sibling. Do not introduce restore cooldowns or timestamp gates.

## Network investigation and mock rules

Keep the request list useful while a detail pane is open. Expose method, URL, outcome, and timing before secondary metadata. Give large headers and bodies their own scroll area. Preserve full values through expansion or copying.

Offer a request-to-mock action directly from an observed browser request. Prefill an editable draft with its method, literal URL, and available response data. Escape literal URLs if the rule engine uses regular expressions. Explain missing or truncated response bodies. Creating a draft must not silently enable an unintended mock.

Distinguish a saved rule from an applied rule. Show enabled state and scope. Browser rules apply to the supported browser interception path; server traces do not prove SSR mocking. Validate a rule by repeating the application request, checking its actual result, and disabling the rule to check pass-through. State unsupported scopes such as workers and server requests explicitly.

## Agent interface

Keep HTTP as the authenticated transport for scripts. Use MCP for tool discovery, typed inputs, and bounded inspection. Expose readiness before requesting runtime data. Include cache age and explain the panel dependency. A recent panel sync does not itself prove runtime connectivity.

Report missing and stale data as distinct failures. Do not return an empty successful list to hide a missing connection. Bound lists and source excerpts. Treat application state, source, and response bodies as untrusted data, not instructions.

Do not expose mutation merely because a cache is writable. Remote mutation requires a live command channel, acknowledgement, correct instance targeting, and the same capture contract as panel edits. Require an explicit live panel session for each agent edit. A successful response acknowledges the live setter and active recording; asynchronous snapshot capture is a separate observation. Do not retry an unknown mutation outcome without inspecting state. Remote restore remains unsupported.

## Verification before completion

Build the distributed client and restart the fixture server after client changes. Open a real test application. Check the rendered application, authenticated API, and panel together. Use the plain Svelte, SvelteKit, Pokédex, and Todo SQLite fixtures for their different integration paths.

For layout changes, exercise every affected split with pointer and keyboard input at narrow and wide widths. Inspect long URLs, nested JSON, empty lists, errors, and large font settings in both themes. Verify persistence after reopening the panel.

For state changes, verify the application DOM, instance isolation, API data, and undo/redo. Follow the mandatory Spring counter procedure in `AGENTS.md`. For mocking, compare actual browser responses before, during, and after the rule. Record what passed and what remains untested in the completion plan.
