<script lang="ts">
  import type { Snippet } from 'svelte';

  let { fallback = null, children }: { fallback?: Snippet, children: Snippet } = $props();

  let error = $state<Error | null>(null);
  let hasError = $state(false);

  $effect(() => {
    const errorHandler = (event: ErrorEvent) => {
      error = event.error;
      hasError = true;
    };

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      error = new Error(String(event.reason));
      hasError = true;
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  });

  function reset() {
    error = null;
    hasError = false;
  }
</script>

{#if hasError && error}
  <div class="error-boundary">
    <div class="error-header">
      <span class="error-icon">⚠️</span>
      <h3>Something went wrong</h3>
    </div>
    <div class="error-message">
      <code>{error.message}</code>
    </div>
    {#if fallback}
      {@render fallback(error)}
    {:else}
      <details>
        <summary>Stack trace</summary>
        <pre>{error.stack}</pre>
      </details>
    {/if}
    <button class="retry-button" onclick={reset}>
      Try again
    </button>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .error-boundary {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: #5a1d1d;
    border: 1px solid #f48771;
    border-radius: 4px;
    margin: 8px;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .error-icon {
    font-size: 20px;
  }

  .error-header h3 {
    margin: 0;
    color: #f48771;
    font-size: 14px;
  }

  .error-message {
    background: #1e1e1e;
    padding: 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    color: #d4d4d4;
  }

  .error-message code {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
  }

  details {
    background: #1e1e1e;
    padding: 8px;
    border-radius: 4px;
  }

  summary {
    cursor: pointer;
    color: #858585;
    font-size: 12px;
  }

  pre {
    margin-top: 8px;
    padding: 8px;
    background: #0d0d0d;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 11px;
    color: #d4d4d4;
    max-height: 200px;
    overflow-y: auto;
  }

  .retry-button {
    align-self: flex-start;
    padding: 6px 12px;
    background: #0e639c;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .retry-button:hover {
    background: #1177bb;
  }
</style>
