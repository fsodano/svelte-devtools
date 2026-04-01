<script lang="ts">
  import type { ComponentNode } from '@svelte-devtools/types';

  let {
    onSearch,
    placeholder = 'Search components...',
    debounceMs = 150
  } = $props<{
    onSearch: (query: string, results: ComponentNode[]) => void;
    placeholder?: string;
    debounceMs?: number;
    components: ComponentNode[];
  }>();

  let query = $state('');
  let debouncedQuery = $state('');
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      debouncedQuery = query;
    }, debounceMs);

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  });

  function searchComponents(searchQuery: string, components: ComponentNode[]): ComponentNode[] {
    if (!searchQuery.trim()) return [];

    const lowerQuery = searchQuery.toLowerCase();

    return components.filter(comp => {
      // Search in component name
      if (comp.name.toLowerCase().includes(lowerQuery)) return true;

      // Search in filename
      if (comp.filename?.toLowerCase().includes(lowerQuery)) return true;

      // Search in state keys
      const stateKeys = Object.keys(comp.state || {});
      if (stateKeys.some(key => key.toLowerCase().includes(lowerQuery))) return true;

      // Search in state values (stringified)
      const stateValues = Object.values(comp.state || {});
      if (stateValues.some(val => String(val).toLowerCase().includes(lowerQuery))) return true;

      return false;
    });
  }

  $effect(() => {
    if (debouncedQuery) {
      const results = searchComponents(debouncedQuery, []); // Will be passed from parent
      onSearch(debouncedQuery, results);
    } else {
      onSearch('', []);
    }
  });

  function clear() {
    query = '';
  }
</script>

<div class="search-box">
  <span class="search-icon">🔍</span>
  <input
    type="text"
    bind:value={query}
    placeholder={placeholder}
    class="search-input"
  />
  {#if query}
    <button class="clear-button" onclick={clear} title="Clear search">
      ✕
    </button>
  {/if}
  <span class="search-hint">Press Esc to clear</span>
</div>

<style>
  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #252526;
    border-bottom: 1px solid #3c3c3c;
  }

  .search-icon {
    font-size: 14px;
    opacity: 0.6;
  }

  .search-input {
    flex: 1;
    padding: 6px 10px;
    background: #3c3c3c;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .search-input:focus {
    border-color: #0e639c;
  }

  .search-input::placeholder {
    color: #858585;
  }

  .clear-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: #858585;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s ease;
  }

  .clear-button:hover {
    background: #3c3c3c;
    color: #d4d4d4;
  }

  .search-hint {
    font-size: 11px;
    color: #858585;
    opacity: 0.6;
  }
</style>
