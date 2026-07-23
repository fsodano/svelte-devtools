<script lang="ts">
  import { untrack } from 'svelte';
  import { devtoolsStore } from '../lib/stores/devtools-store.svelte';

  interface Component {
    id: string;
    name: string;
    children: string[];
    parentId?: string;
    renderDuration?: number;
    filename?: string;
    sourceLocation?: { filename: string; line: number; column: number };
    state?: Record<string, unknown>;
  }

  interface ExpandedState {
    [key: string]: boolean;
  }

  let {
    components = [],
    selectedId = null,
    onSelect,
  }: {
    components: Component[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  } = $props();

  let expanded = $state<ExpandedState>({});
  let searchTerm = $state('');
  let virtualizedHeight = 400;

  function getRootComponents(): Component[] {
    return components.filter((c) => !c.parentId);
  }

  function getChildren(parentId: string): Component[] {
    return components.filter((c) => c.parentId === parentId);
  }

  function toggleExpand(id: string): void {
    expanded[id] = !expanded[id];
  }

  function isExpanded(id: string): boolean {
    return expanded[id] ?? true;
  }

  function renderDuration(duration: number | undefined): string {
    if (!duration) return '';
    return `${duration.toFixed(1)}ms`;
  }

  function formatSourceLocation(
    sourceLocation:
      | { filename: string; line: number; column: number }
      | undefined,
  ): string {
    if (!sourceLocation) return '';
    const filename =
      sourceLocation.filename.split('/').pop() || sourceLocation.filename;
    return `${filename}:${sourceLocation.line}:${sourceLocation.column}`;
  }

  function openSourceLocation(
    sourceLocation:
      | { filename: string; line: number; column: number }
      | undefined,
  ): void {
    if (!sourceLocation) return;

    import('../lib/open-in-editor.js').then(({ openInEditor }) =>
      openInEditor(sourceLocation.filename, sourceLocation.line, sourceLocation.column),
    );
  }

  function flattenTree(
    components: Component[],
    expanded: ExpandedState,
    depth: number = 0,
  ): { component: Component; depth: number }[] {
    const result: { component: Component; depth: number }[] = [];

    for (const component of components) {
      result.push({ component, depth });
      if (isExpanded(component.id) && getChildren(component.id).length > 0) {
        result.push(
          ...flattenTree(getChildren(component.id), expanded, depth + 1),
        );
      }
    }

    return result;
  }

  const flatList = $derived.by(() => {
    const roots = getRootComponents();
    return flattenTree(roots, expanded);
  });

  const filteredList = $derived.by(() => {
    if (!searchTerm.trim()) return flatList;
    const lowerTerm = searchTerm.toLowerCase();
    return flatList.filter(
      ({ component }) =>
        component.name.toLowerCase().includes(lowerTerm) ||
        (component.filename &&
          component.filename.toLowerCase().includes(lowerTerm)) ||
        (component.state &&
          Object.keys(component.state).some((key) =>
            key.toLowerCase().includes(lowerTerm),
          )),
    );
  });

  const matchCount = $derived(filteredList.length);

  // Sync local search term to the store for global state tracking
  // Only reacts to searchTerm changes, not to components — avoids effect cascades
  // during rapid bridge syncs at startup
  let prevSearchTerm = $state(searchTerm);
  $effect(() => {
    if (searchTerm !== prevSearchTerm) {
      prevSearchTerm = searchTerm;
      // Use untrack to prevent `components` from becoming a tracked dependency
      // (avoids cascading re-runs during bridge syncs after user has searched)
      const comps = untrack(() => components);
      devtoolsStore.setSearchQuery(searchTerm, comps as unknown as import('@svelte-devtools/types').ComponentNode[]);
    }
  });

  let visibleStart = $state(0);
  let visibleEnd = $state(0);
  let listRef: HTMLDivElement | null = null;

  function updateVisibleRange(): void {
    if (!listRef) return;
    const { scrollTop, clientHeight } = listRef;
    const itemHeight = 32;
    visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight));
    visibleEnd = Math.min(
      filteredList.length,
      visibleStart + Math.ceil(clientHeight / itemHeight) + 1,
    );
  }

  $effect(() => {
    if (listRef) {
      listRef.addEventListener('scroll', updateVisibleRange);
      updateVisibleRange();
      return () => listRef?.removeEventListener('scroll', updateVisibleRange);
    }
  });

  // Update visible range when the filtered list length changes.
  // Using untrack to avoid cascading effect re-runs from `listRef` reads.
  let prevListLength = $state(0);
  $effect(() => {
    prevListLength = filteredList.length;
    untrack(() => { if (listRef) updateVisibleRange(); });
  });
</script>

<div class="tree-container">
  <div class="search-bar">
    <div class="search-wrapper">
      <svg
        class="search-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="Search components..."
        bind:value={searchTerm}
        class="search-input"
      />
      {#if searchTerm.trim()}
        <span class="match-count">
          {matchCount} match{matchCount !== 1 ? 'es' : ''}
        </span>
      {/if}
    </div>
  </div>

  <div class="tree" bind:this={listRef} style="height: {virtualizedHeight}px">
    {#if filteredList.length === 0 && searchTerm.trim()}
      <div class="empty-search">
        <svg
          class="empty-search-icon"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
        <span class="empty-search-text">
          No components match "<strong>{searchTerm}</strong>"
        </span>
        <span class="empty-search-hint">Try a different name, filename, or state key</span>
      </div>
    {:else}
      <div class="tree-content" style="height: {filteredList.length * 32}px">
        {#each filteredList.slice(visibleStart, visibleEnd) as item, i (item.component.id)}
          <div
            class="tree-node"
            style="transform: translateY({(visibleStart + i) * 32}px); padding-left: {item.depth * 24 + 8}px"
          >
            <div
              class="component-row"
              class:selected={selectedId === item.component.id}
              role="button"
              tabindex="0"
              aria-label="Select {item.component.name} component"
              onclick={() => onSelect(item.component.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item.component.id);
                }
              }}
            >
              <div class="indent-guide">
                {#each Array(item.depth) as _, idx}
                  <span
                    class="indent-line"
                    class:last={idx === item.depth - 1}
                    style="left: {idx * 24 + 12}px"
                  ></span>
                {/each}
              </div>

              <div class="component-content">
                {#if getChildren(item.component.id).length > 0}
                  <span
                    class="toggle-button"
                    role="button"
                    tabindex="0"
                    aria-label={isExpanded(item.component.id)
                      ? 'Collapse'
                      : 'Expand'}
                    onclick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.component.id);
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(item.component.id);
                      }
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style="transform: rotate({isExpanded(item.component.id)
                        ? 90
                        : 0}deg); transition: transform var(--transition-fast);"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                {:else}
                  <span class="placeholder-toggle"></span>
                {/if}

                <span class="name">{item.component.name}</span>

                {#if item.component.renderDuration}
                  <span
                    class="duration"
                    class:slow={item.component.renderDuration > 16}
                  >
                    {renderDuration(item.component.renderDuration)}
                  </span>
                {/if}
              </div>

              {#if item.component.sourceLocation}
                <span
                  class="source-link"
                  role="button"
                  tabindex="0"
                  onclick={(e) => {
                    e.stopPropagation();
                    openSourceLocation(item.component.sourceLocation);
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openSourceLocation(item.component.sourceLocation);
                    }
                  }}
                  title="Click to open source file"
                >
                  {formatSourceLocation(item.component.sourceLocation)}
                </span>
              {:else if item.component.filename}
                <span class="source-filename" title={item.component.filename}>
                  {item.component.filename.split('/').pop()}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .tree-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .search-bar {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-default);
    background: var(--bg-surface);
  }

  .search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    color: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 6px 10px 6px 34px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-inset);
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-ui);
    outline: none;
    transition: border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--svelte-brand-10);
  }

  .match-count {
    position: absolute;
    right: var(--space-2);
    padding: 2px 8px;
    border-radius: 100px;
    background: var(--svelte-brand-10);
    color: var(--accent-primary);
    font-size: 10px;
    font-weight: 500;
    font-family: var(--font-ui);
    line-height: 1.4;
    pointer-events: none;
    white-space: nowrap;
  }

  .tree {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
    position: relative;
  }

  .tree-content {
    position: relative;
    transition: opacity 120ms ease;
  }

  .tree-node {
    position: absolute;
    width: 100%;
    height: 32px;
    box-sizing: border-box;
    padding-right: var(--space-4);
  }

  .component-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    padding: 0 var(--space-3);
    margin: 0 var(--space-2);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-md);
    font-size: 12px;
    text-align: left;
    transition: background var(--transition-fast),
      color var(--transition-fast);
    position: relative;
  }

  .component-row:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .component-row.selected {
    background: var(--svelte-brand-10);
    color: var(--text-primary);
  }

  .component-row:focus {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .indent-guide {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 0;
    pointer-events: none;
  }

  .indent-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border-default);
    opacity: 0.5;
  }

  .indent-line.last {
    background: var(--border-subtle);
    opacity: 1;
  }

  .component-content {
    display: flex;
    align-items: center;
    flex: 1;
    position: relative;
    z-index: 1;
  }

  .toggle-button {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: var(--space-1);
    transition: color var(--transition-fast);
    user-select: none;
  }

  .toggle-button:hover {
    color: var(--text-primary);
  }

  .placeholder-toggle {
    width: 20px;
    display: inline-block;
  }

  .name {
    font-family: var(--font-mono);
    flex: 1;
  }

  .duration {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: var(--space-2);
    font-family: var(--font-mono);
  }

  .duration.slow {
    color: var(--status-disconnected);
  }

  .source-filename {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    cursor: default;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    margin-left: var(--space-2);
    background: var(--svelte-brand-10);
    color: var(--accent-primary);
    border-radius: var(--radius-sm);
    font-size: 10px;
    cursor: pointer;
    font-family: var(--font-mono);
    transition: background var(--transition-fast),
      color var(--transition-fast);
    flex-shrink: 0;
  }

  .source-link:hover {
    background: var(--accent-primary);
    color: #fff;
  }

  .source-link:focus {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .empty-search {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--space-8) var(--space-4);
    text-align: center;
    animation: fadeIn 200ms ease-out;
  }

  .empty-search-icon {
    color: var(--text-muted);
    opacity: 0.4;
    margin-bottom: var(--space-3);
  }

  .empty-search-text {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: var(--space-1);
  }

  .empty-search-text strong {
    color: var(--text-primary);
    font-weight: 500;
  }

  .empty-search-hint {
    font-size: 11px;
    color: var(--text-muted);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
