<script lang="ts">
  import { devtoolsStore } from "../lib/stores/devtools-store.svelte";
  import JsonTree from "./JsonTree.svelte";

  let { componentId }: { componentId: string } = $props();

  const component = $derived(
    devtoolsStore.components.find((c) => c.id === componentId),
  );
  let activeTab = $state<"props" | "state" | "dom" | "source">("props");

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

    const message = {
      type: "open-source",
      payload: {
        filename: component.sourceLocation.filename,
        line: component.sourceLocation.line,
        column: component.sourceLocation.column,
      },
    };

    chrome.runtime.sendMessage(message);
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
        class:active={activeTab === "props"}
        onclick={() => (activeTab = "props")}
      >
        Props
      </button>
      <button
        class="tab"
        class:active={activeTab === "state"}
        onclick={() => (activeTab = "state")}
      >
        State
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
      {#if activeTab === "props"}
        {#if Object.keys(component.props || {}).length > 0}
          <div class="props-list">
            {#each Object.entries(component.props || {}) as [key, value] (key)}
              <div class="prop-row">
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
      {:else if activeTab === "state"}
        {#if Object.keys(component.state || {}).length > 0}
          <div class="props-list">
            {#each Object.entries(component.state || {}) as [key, value] (key)}
              <div class="prop-row">
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
    background: #252526;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #333;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: #cccccc;
    font-family: "Monaco", "Menlo", monospace;
  }

  .badge {
    padding: 2px 8px;
    background: #37373d;
    border-radius: 3px;
    font-size: 11px;
    color: #858585;
  }

  .badge.slow {
    background: #5a1d1d;
    color: #f48771;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #333;
  }

  .tab {
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: #858585;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }

  .tab:hover {
    color: #cccccc;
    background: #2a2d2e;
  }

  .tab.active {
    color: #ffffff;
    background: #37373d;
    border-bottom: 2px solid #007acc;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .props-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prop-row {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: 12px;
    align-items: center;
    padding: 8px;
    background: #1e1e1e;
    border-radius: 4px;
  }

  .prop-key {
    font-family: "Monaco", "Menlo", monospace;
    color: #9cdcfe;
    font-size: 12px;
  }

  .prop-value {
    font-family: "Monaco", "Menlo", monospace;
    color: #ce9178;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prop-value:has(.json-tree) {
    overflow: visible;
    text-overflow: unset;
    white-space: normal;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #858585;
    font-size: 12px;
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .source-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: #1e1e1e;
    border-radius: 4px;
  }

  .source-row .label {
    font-size: 11px;
    color: #858585;
    font-weight: 600;
  }

  .source-row .value {
    font-family: "Monaco", "Menlo", monospace;
    font-size: 12px;
    color: #ce9178;
    word-break: break-all;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    background: #0e639c;
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    font-family: "Monaco", "Menlo", monospace;
    transition: background 0.15s;
  }

  .source-link:hover {
    background: #1177bb;
  }
</style>
