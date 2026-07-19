<script lang="ts">
  import JsonTree from "./JsonTree.svelte";

  let { value, name, seen = null }: { value: unknown; name?: string; seen?: Set<unknown> | null } = $props();

  let expanded = $state(true);
  let isCircular = $state(false);

  let localSeen = $derived(seen ?? new Set<unknown>());
  let visited = $state(new Set<unknown>());

  // Check for circular reference on mount
  $effect(() => {
    visited = new Set(localSeen);
    if (value && typeof value === "object") {
      if (visited.has(value)) {
        isCircular = true;
      } else {
        visited.add(value);
        isCircular = false;
      }
    }
  });

  function getValueType(val: unknown): "null" | "undefined" | "string" | "number" | "boolean" | "array" | "object" {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (typeof val === "string") return "string";
    if (typeof val === "number") return "number";
    if (typeof val === "boolean") return "boolean";
    if (Array.isArray(val)) return "array";
    if (typeof val === "object") return "object";
    return "unknown";
  }

  function getEntries(val: unknown): [string, unknown][] {
    if (val && typeof val === "object") {
      return Object.entries(val);
    }
    return [];
  }

  function getItemCount(val: unknown): number {
    if (Array.isArray(val)) return val.length;
    if (val && typeof val === "object") return Object.keys(val).length;
    return 0;
  }

  function toggle(): void {
    expanded = !expanded;
  }
</script>

{#snippet valueNode(val: unknown, key?: string, currentSeen: Set<unknown>)}
  {@const type = getValueType(val)}
  {@const itemCount = getItemCount(val)}
  {@const entries = getEntries(val)}
  {@const isObjOrArray = type === "object" || type === "array"}
  {@const isObjOrArrayEmpty = itemCount === 0}

  {#if isObjOrArray}
    {#if currentSeen.has(val)}
      <span class="circular">[Circular]</span>
    {:else}
      {@const newSeen = new Set(currentSeen)}
      {@const _ = newSeen.add(val)}
      <span class="node">
        {#if key !== undefined}
          <span class="key">"{key}"</span>
          <span class="colon">: </span>
        {/if}
        <button class="toggle" onclick={toggle} aria-expanded={expanded}>
          {expanded ? "▼" : "▶"}
        </button>
        {#if type === "array"}
          <span class="bracket">[</span>
          {#if expanded}
            {#if isObjOrArrayEmpty}
              <span class="bracket">]</span>
            {:else}
              <span class="children">
                {#each entries as [k, v], i (k)}
                  <div class="entry">
                    <JsonTree value={v} name={Array.isArray(v) ? String(i) : k} seen={newSeen} />
                    {#if i < entries.length - 1}<span class="comma">,</span>{/if}
                  </div>
                {/each}
              </span>
              <span class="bracket">]</span>
            {/if}
          {:else}
            <span class="collapsed-preview">
              {#if isObjOrArrayEmpty}
                <span class="bracket">]</span>
              {:else}
                <span class="ellipsis">...</span>
                <span class="count">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
                <span class="bracket">]</span>
              {/if}
            </span>
          {/if}
        {:else}
          <span class="brace">{"{"}</span>
          {#if expanded}
            {#if isObjOrArrayEmpty}
              <span class="brace">{"}"}</span>
            {:else}
              <span class="children">
                {#each entries as [k, v], i (k)}
                  <div class="entry">
                    <JsonTree value={v} name={k} seen={newSeen} />
                    {#if i < entries.length - 1}<span class="comma">,</span>{/if}
                  </div>
                {/each}
              </span>
              <span class="brace">{"}"}</span>
            {/if}
          {:else}
            <span class="collapsed-preview">
              {#if isObjOrArrayEmpty}
                <span class="brace">{"}"}</span>
              {:else}
                <span class="ellipsis">...</span>
                <span class="count">{itemCount} {itemCount === 1 ? "key" : "keys"}</span>
                <span class="brace">{"}"}</span>
              {/if}
            </span>
          {/if}
        {/if}
      </span>
    {/if}
  {:else}
    <span class="primitive">
      {#if key !== undefined}
        <span class="key">"{key}"</span>
        <span class="colon">: </span>
      {/if}
      {#if type === "string"}
        <span class="string">"{val}"</span>
      {:else if type === "number"}
        <span class="number">{val}</span>
      {:else if type === "boolean"}
        <span class="boolean">{String(val)}</span>
      {:else if type === "null"}
        <span class="null">null</span>
      {:else if type === "undefined"}
        <span class="undefined">undefined</span>
      {:else}
        <span class="unknown">{String(val)}</span>
      {/if}
    </span>
  {/if}
{/snippet}

<div class="json-tree">
  {#if name !== undefined}
    <span class="named-node">
      {@render valueNode(value, name, visited)}
    </span>
  {:else}
    {@render valueNode(value, undefined, visited)}
  {/if}
</div>

<style>
  .json-tree {
    font-family: "Monaco", "Menlo", monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  .node,
  .primitive {
    display: inline;
  }

  .named-node {
    display: inline;
  }

  .key {
    color: #9cdcfe;
  }

  .colon {
    color: #808080;
  }

  .string {
    color: #ce9178;
  }

  .number {
    color: #b5cea8;
  }

  .boolean {
    color: #569cd6;
  }

  .null,
  .undefined {
    color: #569cd6;
  }

  .bracket,
  .brace {
    color: #808080;
  }

  .toggle {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: #808080;
    font-family: inherit;
    font-size: 10px;
    line-height: 1;
    vertical-align: middle;
  }

  .toggle:hover {
    color: #cccccc;
  }

  .children {
    display: block;
    margin-left: 16px;
    border-left: 1px solid #333;
    padding-left: 4px;
  }

  .entry {
    display: block;
    margin: 2px 0;
  }

  .comma {
    color: #808080;
  }

  .collapsed-preview {
    color: #808080;
  }

  .ellipsis {
    color: #569cd6;
  }

  .count {
    color: #858585;
    font-size: 11px;
  }

  .circular {
    color: #569cd6;
    font-style: italic;
  }
</style>
