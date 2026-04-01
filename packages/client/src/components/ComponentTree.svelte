<script lang="ts">
  interface Component {
    id: string;
    name: string;
    children: string[];
    parentId?: string;
    renderDuration?: number;
    filename?: string;
    sourceLocation?: { filename: string; line: number; column: number };
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
  let searchTerm = $state("");
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
    if (!duration) return "";
    return duration > 16
      ? `⚠️ ${duration.toFixed(1)}ms`
      : `${duration.toFixed(1)}ms`;
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

  function openSourceLocation(
    sourceLocation:
      | { filename: string; line: number; column: number }
      | undefined,
  ): void {
    if (!sourceLocation) return;

    const message = {
      type: "open-source",
      payload: {
        filename: sourceLocation.filename,
        line: sourceLocation.line,
        column: sourceLocation.column,
      },
    };

    chrome.runtime.sendMessage(message);
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
          component.filename.toLowerCase().includes(lowerTerm)),
    );
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
      listRef.addEventListener("scroll", updateVisibleRange);
      updateVisibleRange();
      return () => listRef?.removeEventListener("scroll", updateVisibleRange);
    }
  });

  $effect(() => {
    updateVisibleRange();
  });
</script>

<div class="tree-container">
  <div class="search-bar">
    <input
      type="text"
      placeholder="Search components..."
      bind:value={searchTerm}
      class="search-input"
    />
  </div>

  <div class="tree" bind:this={listRef} style="height: {virtualizedHeight}px">
    <div class="tree-content" style="height: {filteredList.length * 32}px">
      {#each filteredList.slice(visibleStart, visibleEnd) as item, i (item.component.id)}
        <div
          class="tree-node"
          style="transform: translateY({(visibleStart + i) *
            32}px); padding-left: {item.depth * 24 + 8}px"
        >
          <div
            class="component-row"
            role="button"
            tabindex="0"
            aria-label="Select {item.component.name} component"
            onclick={() => onSelect(item.component.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(item.component.id);
              }
            }}
          >
            <div class="component-content">
              {#if getChildren(item.component.id).length > 0}
                <span
                  class="toggle-button"
                  role="button"
                  tabindex="0"
                  aria-label={isExpanded(item.component.id)
                    ? "Collapse"
                    : "Expand"}
                  onclick={(e) => {
                    e.stopPropagation();
                    toggleExpand(item.component.id);
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(item.component.id);
                    }
                  }}
                >
                  {isExpanded(item.component.id) ? "▼" : "▶"}
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
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openSourceLocation(item.component.sourceLocation);
                  }
                }}
                title="Click to open source file"
              >
                {formatSourceLocation(item.component.sourceLocation)}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .tree-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #252526;
  }

  .search-bar {
    padding: 8px;
    border-bottom: 1px solid #3c3c3c;
    background: #1e1e1e;
  }

  .search-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    background: #2d2d2d;
    color: #d4d4d4;
    font-size: 12px;
    outline: none;
  }

  .search-input:focus {
    border-color: #0e639c;
  }

  .tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    position: relative;
  }

  .tree-content {
    position: relative;
  }

  .tree-node {
    position: absolute;
    width: 100%;
    height: 32px;
    box-sizing: border-box;
  }

  .component-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: #cccccc;
    cursor: pointer;
    border-radius: 4px;
    font-size: 12px;
    text-align: left;
    transition: background 0.15s;
  }

  .component-row:hover {
    background: #2a2d2e;
  }

  .component-row:focus {
    outline: 2px solid #0e639c;
    outline-offset: -2px;
  }

  .component-content {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .toggle-button {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: #858585;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
    transition: color 0.15s;
    user-select: none;
  }

  .toggle-button:hover {
    color: #cccccc;
  }

  .placeholder-toggle {
    width: 20px;
    display: inline-block;
  }

  .name {
    font-family: "Monaco", "Menlo", monospace;
    flex: 1;
  }

  .duration {
    font-size: 10px;
    color: #858585;
    margin-left: 8px;
  }

  .duration.slow {
    color: #f48771;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    margin-left: 8px;
    background: #0e639c;
    color: white;
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
    font-family: "Monaco", "Menlo", monospace;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .source-link:hover {
    background: #1177bb;
  }

  .source-link:focus {
    outline: 2px solid #0e639c;
    outline-offset: 2px;
  }
</style>
