<script lang="ts">
  import { traceRows, formatTraceDuration, type NetworkEntry } from '../lib/server-traces.js';
  let { entry, entries, onselect }: { entry: NetworkEntry; entries: NetworkEntry[]; onselect: (entry: NetworkEntry) => void } = $props();
  const spans = $derived(traceRows(entries, entry));
  let copyStatus = $state('');
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); copyStatus = `${label} copied`; }
    catch { copyStatus = 'Copy unavailable. Select the text to copy it.'; }
  }
</script>

<section class="trace-detail" aria-label="Server trace details">
  {#if entry.type === 'server:sql'}
    <div class="sql-heading"><strong>SQLite · {entry.operation || 'Query'}</strong><span class:error={entry.status === 'error'}>{entry.status || 'ok'}</span></div>
    <dl><dt>Database</dt><dd>{entry.database || 'Not specified'}</dd>
      {#if entry.rowCount !== undefined}<dt>Rows</dt><dd>{entry.rowCount}</dd>{/if}
    </dl>
    {#if entry.statement}
      <div class="sql-heading"><strong>Statement</strong><button onclick={() => copy('Statement', entry.statement!)}>Copy SQL</button></div>
      <pre class="sql">{entry.statement}</pre>
      {#if entry.statementTruncated}<p class="note">Statement preview is truncated.</p>{/if}
    {:else}<p class="note">Statement not captured. Enable captureStatement in the server adapter to include SQL text.</p>{/if}
    <p class="note">Bindings and result rows are not collected.</p>
    {#if entry.error?.code}<p class="error">{entry.error.code}</p>{/if}
  {/if}
  <dl class="identifiers">
    {#if entry.traceId}<dt>Trace</dt><dd><code>{entry.traceId}</code><button onclick={() => copy('Trace ID', entry.traceId!)}>Copy</button></dd>{/if}
    {#if entry.spanId}<dt>Span</dt><dd><code>{entry.spanId}</code></dd>{/if}
    {#if entry.parentSpanId}<dt>Parent</dt><dd><code>{entry.parentSpanId}</code></dd>{/if}
  </dl>
  {#if entry.traceId}
    <div class="sql-heading"><strong>Trace waterfall</strong><span>{spans.length} spans</span></div>
    <p class="note">Offsets from the earliest retained span. HTTP duration covers the server handler; SQL duration covers execution.</p>
    <div class="waterfall">
      {#each spans as span (span.entry.id)}
        <button class="span-row" class:active={span.entry.id === entry.id} onclick={() => onselect(span.entry)} aria-label={`Inspect ${span.entry.operation || span.entry.method || span.entry.type} span`}>
          <span class="span-label" style:padding-left={`${span.depth * 8}px`}>{span.entry.operation || span.entry.method || span.entry.type} · {span.entry.statement || span.entry.url || span.entry.database || 'Span'}</span>
          <span class="timing">+{span.offset.toFixed(1)} ms · {formatTraceDuration(span.entry.duration ?? 0, span.entry.type)}</span>
          <span class="track"><span class="bar" class:sql-bar={span.entry.type === 'server:sql'} style:left={`${span.left}%`} style:width={`${Math.min(span.width, 100 - span.left)}%`}></span></span>
          {#if span.missingParent}<span class="note">Parent not retained in this buffer.</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
  {#if copyStatus}<p role="status" class="note">{copyStatus}</p>{/if}
</section>

<style>
  .trace-detail { min-width: 0; display: grid; gap: 10px; margin-bottom: 12px; }
  .sql-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
  .sql-heading > span, .note { color: var(--text-muted); }
  .note { margin: 0; font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: 11px; }
  dt { color: var(--text-muted); } dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  dd button { margin-left: 8px; } code, .sql { font-family: var(--font-mono); }
  .sql { margin: 0; padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg-inset); border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: 12px; line-height: 1.6; max-height: 320px; overflow: auto; }
  button { color: var(--text-primary); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 4px 8px; cursor: pointer; }
  button:hover { background: var(--bg-hover); } button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
  .waterfall { display: grid; gap: 5px; min-width: 0; }
  .span-row { display: grid; gap: 5px; text-align: left; min-width: 0; padding: 8px; }
  .span-row.active { border-color: var(--accent-primary); }
  .span-label { overflow-wrap: anywhere; font-size: 11px; min-width: 0; }
  .timing { font-size: 10px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .track { display: block; position: relative; height: 6px; background: var(--bg-inset); overflow: hidden; border-radius: 3px; }
  .bar { position: absolute; top: 0; height: 6px; background: var(--accent-primary); border-radius: 3px; min-width: 2px; }
  .sql-bar { background: #a78bfa; } .error { color: var(--status-error); }
</style>
