<script lang="ts">
  import { devtoolsStore } from "../lib/stores/devtools-store.svelte";
  import JsonTree from "./JsonTree.svelte";
  import DomInfo from "./DomInfo.svelte";
  import { getSourceLocation, formatSourceLocation, openInEditor } from "../lib/open-in-editor.js";

  let { componentId }: { componentId: string } = $props();

  const component = $derived(
    devtoolsStore.components.find((c) => c.id === componentId),
  );
  let activeTab = $state<"props" | "state" | "dom" | "source">("props");

  let edit = $state<{ id: string; key: string; text: string } | null>(null);
  let editError = $state('');
  const writableKeys = $derived.by(() => {
    if (!component) return [];
    const api = ((window.opener || window.parent) as unknown as { __SVELTE_DEVTOOLS__?: import('@fsodano/svelte-devtools-types').SvelteDevToolsAPI }).__SVELTE_DEVTOOLS__;
    return api?.getWritableStateKeys?.(component.id) ?? [];
  });
  function beginEdit(key: string) {
    editError = '';
    const target = window.opener || window.parent;
    const api = (target as unknown as { __SVELTE_DEVTOOLS__?: import('@fsodano/svelte-devtools-types').SvelteDevToolsAPI }).__SVELTE_DEVTOOLS__;
    if (!api?.getWritableStateKeys?.(componentId).includes(key)) return;
    const value = api.getComponentById(componentId)?.state.get(key);
    const text = JSON.stringify(value, null, 2);
    if (text === undefined) return;
    edit = { id: componentId, key, text };
  }
  function saveEdit() {
    if (!edit || edit.id !== componentId) return;
    try {
      const value = JSON.parse(edit.text);
      devtoolsStore.isRecording = true;
      devtoolsStore.timeTravel.setStateEdit(edit.id, edit.key, value);
      edit = null;
      editError = '';
    } catch (e) { editError = e instanceof Error ? e.message : String(e); }
  }

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

  const sourceLocation = $derived(component ? getSourceLocation(component) : undefined);
  let editorError = $state<{ componentId: string; message: string } | null>(null);
  let openingEditor = $state(false);

  async function openSourceLocation(): Promise<void> {
    if (!sourceLocation || openingEditor) return;
    const requestedId = componentId;
    openingEditor = true;
    editorError = null;
    try {
      await openInEditor(sourceLocation.filename, sourceLocation.line, sourceLocation.column);
    } catch (error) {
      editorError = { componentId: requestedId, message: error instanceof Error ? error.message : String(error) };
    } finally {
      openingEditor = false;
    }
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
        <p class="edit-hint">Edit writable JSON values. Functions, collections, and other non-JSON values are read-only. Saving enables recording so you can undo the change.</p>
        {#if Object.keys(component.state || {}).length > 0}
          <div class="props-list">
            {#each Object.entries(component.state || {}) as [key, value] (key)}
              <div class="state-row">
                <div class="state-heading"><span class="prop-key">{key}</span>
                  {#if writableKeys.includes(key)}<button class="edit-btn" onclick={() => beginEdit(key)} aria-label={`Edit ${key}`}>Edit</button>
                  {:else}<span class="readonly" title="Derived values and values that cannot be represented faithfully as JSON are read-only.">Read-only</span>{/if}
                </div>
                {#if edit?.id === componentId && edit.key === key}
                  <form onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
                    <textarea aria-label={`JSON value for ${key}`} bind:value={edit.text} rows="5" spellcheck="false"></textarea>
                    <div class="edit-actions"><button type="submit" class="edit-btn save">Save & record</button><button type="button" class="edit-btn" onclick={() => { edit = null; editError = ''; }}>Cancel</button></div>
                    {#if editError}<p role="alert" class="editor-error">{editError}</p>{/if}
                  </form>
                {:else if isExpandable(value)}<JsonTree value={value} />
                {:else}<span class="state-value">{formatValue(value)}</span>{/if}
              </div>
            {/each}
          </div>
        {:else}<div class="empty">No state variables (runes) detected</div>{/if}
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
          {#if sourceLocation}
            <div class="source-row">
              <span class="label">Source:</span>
              <button class="source-link" disabled={openingEditor} title={sourceLocation.filename} onclick={openSourceLocation}>
                {openingEditor ? "Opening…" : `Open ${formatSourceLocation(sourceLocation)} in editor`}
              </button>
            </div>
          {:else}
            <div class="empty">No source file was reported for this component</div>
          {/if}
          {#if sourceLocation}
            <p class="source-hint">Uses the editor on the dev server. Set LAUNCH_EDITOR before starting Vite to choose an editor.</p>
          {/if}
          {#if editorError?.componentId === componentId}
            <p class="editor-error" role="alert">{editorError.message}</p>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty">Select a component to see details</div>
  {/if}
</div>

<style>
  .edit-hint { color: var(--text-secondary); font-size: 11px; line-height: 1.6; margin: 0 0 16px; }
  .state-row { padding: 12px 0; border-bottom: 1px solid var(--border-default); min-width: 0; }
  .state-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
  .readonly { color: var(--text-muted); font-size: 10px; }
  .state-value { font: 12px var(--font-mono); overflow-wrap: anywhere; }
  .edit-btn { border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-primary); border-radius: 5px; padding: 5px 9px; font-size: 11px; cursor: pointer; }
  .save { background: var(--accent-primary); color: white; border-color: var(--accent-primary); }
  textarea { width: 100%; min-width: 0; resize: vertical; font: 12px var(--font-mono); padding: 8px; background: var(--bg-inset); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: 5px; }
  .edit-actions { display: flex; gap: 8px; margin-top: 8px; }

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

  .source-hint { font-size: 11px; color: var(--text-secondary); line-height: 1.5; }
  .editor-error { font-size: 12px; color: var(--text-error); }
  .source-link:disabled { opacity: 0.6; cursor: wait; }

  .source-link:hover {
    background: var(--accent-hover);
  }

</style>
