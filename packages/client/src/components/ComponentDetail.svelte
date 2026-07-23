<script lang="ts">
  import { devtoolsStore } from "../lib/stores/devtools-store.svelte";
  import JsonTree from "./JsonTree.svelte";
  import DomInfo from "./DomInfo.svelte";

  let { componentId }: { componentId: string } = $props();

  const component = $derived(
    devtoolsStore.components.find((c) => c.id === componentId),
  );
  let activeTab = $state<"props" | "state" | "dom" | "source">("props");
  // Track recently changed keys for highlight animation
  let changedKeys = $state<Set<string>>(new Set());

  function detectChanges(prev: Record<string, unknown> | undefined, curr: Record<string, unknown>) {
    if (!prev) return;
    const keys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
    const changed = new Set<string>();
    for (const k of keys) {
      if (JSON.stringify(prev[k]) !== JSON.stringify(curr[k])) {
        changed.add(k);
      }
    }
    if (changed.size > 0) {
      changedKeys = changed;
      setTimeout(() => { changedKeys = new Set(); }, 1500);
    }
  }

  let prevState: Record<string, unknown> | undefined;
  let prevProps: Record<string, unknown> | undefined;
  $effect(() => {
    const c = component;
    if (!c) return;
    if (prevState) detectChanges(prevState, c.state || {});
    if (prevProps) detectChanges(prevProps, c.props || {});
    prevState = c.state || {};
    prevProps = c.props || {};
  });

  function isChanged(key: string): boolean { return changedKeys.has(key); }

  function formatValue(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "{...}";
      }
    }
    return String(value);
  }

  function isExpandable(value: unknown): boolean {
    return value !== null && typeof value === "object";
  }

  function copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  function openSourceLocation(): void {
    if (!component?.sourceLocation) return;

    import('../lib/open-in-editor.js').then(({openInEditor}) =>
      openInEditor(component.sourceLocation!.filename, component.sourceLocation!.line, component.sourceLocation!.column)
    );
  }

  function formatSourceLocation(
    sourceLocation:
      | { filename: string; line: number; column: number }
      | undefined,
  ): string {
    if (!sourceLocation) return "";
    const filename =
      sourceLocation.filename.split("/").pop() || sourceLocation.filename;
    return `${filename}:${sourceLocation.line}:${sourceLocation.column}`;
  }
</script>

<div class="detail">
  {#if component}
    <header class="header">
      <h2 class="title">{component.name}</h2>
      {#if component.renderDuration}
        <span class="badge" class:slow={component.renderDuration > 16}>
          {component.renderDuration.toFixed(2)}ms
        </span>
      {/if}
    </header>

    <nav class="tabs">
      <button
        class="tab"
        class:active={activeTab === "state"}
        onclick={() => (activeTab = "state")}
      >
        State
        {#if component.state && Object.keys(component.state).length > 0}
          <span class="badge">{Object.keys(component.state).length}</span>
        {/if}
      </button>
      <button
        class="tab"
        class:active={activeTab === "props"}
        onclick={() => (activeTab = "props")}
      >
        Props
        {#if component.props && Object.keys(component.props).length > 0}
          <span class="badge">{Object.keys(component.props).length}</span>
        {/if}
      </button>
      <button
        class="tab"
        class:active={activeTab === "dom"}
        onclick={() => (activeTab = "dom")}
      >
        DOM
      </button>
      <button
        class="tab"
        class:active={activeTab === "source"}
        onclick={() => (activeTab = "source")}
      >
        Source
      </button>
    </nav>

    <div class="content">
      {#if activeTab === "state"}
        {#if Object.keys(component.state || {}).length > 0}
          <div class="props-list">
            {#each Object.entries(component.state || {}) as [key, value] (key)}
              <div class="prop-row" class:changed={isChanged(key)}>
                <span class="prop-key">{key}</span>
                <span class="prop-value">
                  {#if isExpandable(value)}
                    <JsonTree value={value} />
                  {:else}
                    {formatValue(value)}
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">No state variables (runes) detected</div>
        {/if}
      {:else if activeTab === "props"}
        {#if Object.keys(component.props || {}).length > 0}
          <div class="props-list">
            {#each Object.entries(component.props || {}) as [key, value] (key)}
              <div class="prop-row" class:changed={isChanged(key)}>
                <span class="prop-key">{key}</span>
                <span class="prop-value">
                  {#if isExpandable(value)}
                    <JsonTree value={value} />
                  {:else}
                    {formatValue(value)}
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">No props</div>
        {/if}
      {:else if activeTab === "dom"}
        <DomInfo {componentId} />
      {:else if activeTab === "source"}
        <div class="source-info">
          {#if component.filename}
            <div class="source-row">
              <span class="label">Filename:</span>
              <span class="value">{component.filename}</span>
            </div>
          {/if}
          {#if component.sourceLocation}
            <div class="source-row">
              <span class="label">Location:</span>
              <button class="source-link" onclick={() => openSourceLocation()}>
                {formatSourceLocation(component.sourceLocation)}
              </button>
            </div>
          {:else}
            <div class="empty">No source location available</div>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty">Select a component to see details</div>
  {/if}
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-surface);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-default);
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-mono);
  }

  .badge {
    padding: 2px var(--space-2);
    background: var(--bg-elevated);
    border-radius: var(--radius-sm);
    font-size: 11px;
    color: var(--text-secondary);
  }

  .badge.slow {
    background: var(--bg-error);
    color: var(--text-error);
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-default);
  }

  .tab {
    padding: var(--space-2) var(--space-4);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .tab.active {
    color: var(--text-primary);
    background: var(--bg-elevated);
    border-bottom: 2px solid var(--accent-primary);
  }
  .tab .badge {
    margin-left: 6px; padding: 0 6px; line-height: 16px;
    background: var(--bg-inset); color: var(--text-muted);
    border-radius: 10px; font-size: 10px; font-weight: 500;
    display: inline-block;
  }
  .tab.active .badge {
    background: var(--accent-primary); color: #fff;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  }

  .props-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .prop-row {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-2);
    background: var(--bg-inset);
    border-radius: var(--radius-sm);
  }

  .prop-row.changed {
    animation: highlight-fade 1.5s ease-out;
  }
  @keyframes highlight-fade {
    0% { background: color-mix(in srgb, var(--accent-primary) 30%, var(--bg-inset)); outline: 1px solid var(--accent-primary); }
    100% { background: var(--bg-inset); outline: 1px solid transparent; }
  }

  .prop-key {
    font-family: var(--font-mono);
    color: var(--syntax-key);
    font-size: 12px;
  }

  .prop-value {
    font-family: var(--font-mono);
    color: var(--syntax-string);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .source-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--bg-inset);
    border-radius: var(--radius-sm);
  }

  .source-row .label {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .source-row .value {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--syntax-string);
    word-break: break-all;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    padding: 4px var(--space-2);
    background: var(--accent-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 11px;
    cursor: pointer;
    font-family: var(--font-mono);
    transition: background var(--transition-fast);
  }

  .source-link:hover {
    background: var(--accent-hover);
  }

</style>
