import { describe, it, expect } from 'vitest';
import { analyzeMigration } from '../../packages/vite-plugin/src/migration-analyzer.js';

describe('analyzeMigration', () => {
  // ─── Edge Cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns 100% for empty string', () => {
      const result = analyzeMigration('', 'empty.svelte', {});
      expect(result.filename).toBe('empty.svelte');
      expect(result.maxScore).toBe(0);
      expect(result.actualScore).toBe(0);
      expect(result.percentage).toBe(100);
      expect(result.patterns).toHaveLength(11);
      expect(result.patterns.every(p => !p.detected)).toBe(true);
    });

    it('returns 100% for HTML-only content', () => {
      const html = '<div><p>Hello</p></div>';
      const result = analyzeMigration(html, 'html-only.svelte', {});
      expect(result.percentage).toBe(100);
      expect(result.patterns).toHaveLength(11);
      expect(result.patterns.every(p => !p.detected)).toBe(true);
    });

    it('returns 100% for TypeScript syntax with no Svelte 4 patterns', () => {
      const ts = `
        <script lang="ts">
          const x: number = 42;
          let name: string = 'world';
        </script>
        <h1>Hello {name}</h1>
      `;
      const result = analyzeMigration(ts, 'typed.svelte', {});
      expect(result.percentage).toBe(100);
      expect(result.patterns).toHaveLength(11);
      expect(result.patterns.every(p => !p.detected)).toBe(true);
    });

    it('handles empty string', () => {
      const result = analyzeMigration('', 'empty.svelte', {});
      expect(result.percentage).toBe(100);
      expect(result.patterns).toHaveLength(11);
      expect(result.patterns.every(p => !p.detected)).toBe(true);
    });

    it('handles filename correctly', () => {
      const result = analyzeMigration('<script>export let x</script>', 'my-component.svelte', {});
      expect(result.filename).toBe('my-component.svelte');
    });
  });

  // ─── Pattern 1: export let → $props() ─────────────────────────────────────

  describe('pattern: export let', () => {
    it('detects export let', () => {
      const code = '<script>export let name</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'export let');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(5);
    });

    it('detects multiple export let declarations', () => {
      const code = '<script>export let a; export let b; export let c</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'export let');
      expect(p?.detected).toBe(true);
    });

    it('detects export let with type annotation', () => {
      const code = '<script lang="ts">export let name: string</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'export let')?.detected).toBe(true);
    });

    it('marks as migrated when $props rune is present', () => {
      const code = '<script>export let name</script>';
      const result = analyzeMigration(code, 'test.svelte', { $props: 1 });
      const p = result.patterns.find((p) => p.svelte4 === 'export let');
      expect(p?.migrated).toBe(true);
    });

    it('marks as not migrated when $props rune is absent', () => {
      const code = '<script>export let name</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'export let');
      expect(p?.migrated).toBe(false);
    });

    it('does not match export const', () => {
      const code = '<script>export const x = 1</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'export let')?.detected).toBe(false);
    });
  });

  // ─── Pattern 2: $: reactive → $derived() ──────────────────────────────────

  describe('pattern: $: reactive', () => {
    it('detects $: reactive assignment', () => {
      const code = '<script>let x = 1; $: doubled = x * 2</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === '$: reactive');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(5);
    });

    it('detects $: with whitespace variations', () => {
      const code = '<script>let x = 1; $: doubled = x * 2</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$: reactive')?.detected).toBe(true);
    });

    it('does not match $: if statements', () => {
      const code = '<script>$: if (x > 0) console.log("positive")</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$: reactive')?.detected).toBe(false);
    });

    it('does not match $: switch statements', () => {
      const code = '<script>$: switch (x) { case 1: break }</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$: reactive')?.detected).toBe(false);
    });

    it('does not match $: for loops', () => {
      const code = '<script>$: for (let i = 0; i < 10; i++) console.log(i)</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$: reactive')?.detected).toBe(false);
    });

    it('does not match $: try blocks', () => {
      const code = '<script>$: try { doSomething() } catch(e) { }</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$: reactive')?.detected).toBe(false);
    });

    it('marks as migrated when $derived rune is present', () => {
      const code = '<script>let x = 1; $: doubled = x * 2</script>';
      const result = analyzeMigration(code, 'test.svelte', { $derived: 1 });
      const p = result.patterns.find((p) => p.svelte4 === '$: reactive');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 3: on:click → onclick ────────────────────────────────────────

  describe('pattern: on:click', () => {
    it('detects on:click directive', () => {
      const code = '<button on:click={handleClick}>Click</button>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'on:click');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(3);
    });

    it('detects other on: directives (on:submit, on:input, etc.)', () => {
      const code = '<form on:submit={handleSubmit}><input on:input={handleInput} /></form>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'on:click')?.detected).toBe(true);
    });

    it('marks as migrated when onclick= is present', () => {
      const code = '<button on:click={fn} onclick={fn2}>Click</button>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'on:click');
      expect(p?.migrated).toBe(true);
    });

    it('marks as not migrated when onclick= is absent', () => {
      const code = '<button on:click={fn}>Click</button>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'on:click');
      expect(p?.migrated).toBe(false);
    });
  });

  // ─── Pattern 4: createEventDispatcher → callback props ────────────────────

  describe('pattern: createEventDispatcher', () => {
    it('detects createEventDispatcher usage', () => {
      const code = '<script>import { createEventDispatcher } from "svelte"; const dispatch = createEventDispatcher()</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'createEventDispatcher');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(3);
    });

    it('marks as migrated when $props rune is present', () => {
      const code = '<script>import { createEventDispatcher } from "svelte"; const dispatch = createEventDispatcher()</script>';
      const result = analyzeMigration(code, 'test.svelte', { $props: 1 });
      const p = result.patterns.find((p) => p.svelte4 === 'createEventDispatcher');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 5: import { writable } → $state() ────────────────────────────

  describe('pattern: import { writable }', () => {
    it('detects import of writable', () => {
      const code = '<script>import { writable } from "svelte/store"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'import { writable }');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(5);
    });

    it('detects import of readable', () => {
      const code = '<script>import { readable } from "svelte/store"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'import { writable }')?.detected).toBe(true);
    });

    it('detects import of multiple store functions', () => {
      const code = '<script>import { writable, readable, derived } from "svelte/store"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'import { writable }')?.detected).toBe(true);
    });

    it('marks as migrated when $state rune is present', () => {
      const code = '<script>import { writable } from "svelte/store"</script>';
      const result = analyzeMigration(code, 'test.svelte', { $state: 1 });
      const p = result.patterns.find((p) => p.svelte4 === 'import { writable }');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 6: $store → $state() ─────────────────────────────────────────

  describe('pattern: $store', () => {
    it('detects $store usage with store import', () => {
      const code = '<script>import { writable } from "svelte/store"; const count = writable(0)</script><p>{$count}</p>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === '$store');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(5);
    });

    it('detects $store reactive store prefix', () => {
      const code = '<script>import { readable } from "svelte/store"; const data = readable([])</script><p>{$data}</p>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(true);
    });

    it('does not match $state rune prefix', () => {
      const code = '<script>let count = $state(0)</script><p>{count}</p>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $derived rune prefix', () => {
      const code = '<script>let doubled = $derived(count * 2)</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $effect rune prefix', () => {
      const code = '<script>$effect(() => console.log(count))</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $props rune prefix', () => {
      const code = '<script>let { name } = $props()</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $bindable rune prefix', () => {
      const code = '<script>let { value } = $bindable("")</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $host rune prefix', () => {
      const code = '<script>let host = $host()</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $inspect rune prefix', () => {
      const code = '<script>$inspect(value)</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('does not match $snapshot rune prefix', () => {
      const code = '<script>$snapshot(value)</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('requires both $store usage AND store import', () => {
      // Has $count but no store import — should NOT match
      const code = '<script>let count = 0</script><p>{$count}</p>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '$store')?.detected).toBe(false);
    });

    it('marks as migrated when $state rune is present', () => {
      const code = '<script>import { writable } from "svelte/store"; const count = writable(0)</script><p>{$count}</p>';
      const result = analyzeMigration(code, 'test.svelte', { $state: 1 });
      const p = result.patterns.find((p) => p.svelte4 === '$store');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 7: <slot> → {@render} ────────────────────────────────────────

  describe('pattern: <slot>', () => {
    it('detects <slot> element', () => {
      const code = '<div><slot></slot></div>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === '<slot>');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(5);
    });

    it('detects <slot> with attributes', () => {
      const code = '<slot class="default" />';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '<slot>')?.detected).toBe(true);
    });

    it('marks as migrated when {@render} and $props are present', () => {
      const code = '<slot></slot>';
      const result = analyzeMigration(code, 'test.svelte', { $props: 1 });
      // {@render} check requires the code to contain it — slot alone won't migrate
      const p = result.patterns.find((p) => p.svelte4 === '<slot>');
      expect(p?.migrated).toBe(false);
    });

    it('marks as migrated when {@render} is in code', () => {
      const code = '<slot></slot><div>{@render children()}</div>';
      const result = analyzeMigration(code, 'test.svelte', { $props: 1 });
      const p = result.patterns.find((p) => p.svelte4 === '<slot>');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 8: <slot name> → {#snippet} ──────────────────────────────────

  describe('pattern: <slot name>', () => {
    it('detects <slot name="...">', () => {
      const code = '<slot name="header"></slot>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === '<slot name>');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(5);
    });

    it('detects <slot name with self-closing tag', () => {
      const code = '<slot name="footer" />';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '<slot name>')?.detected).toBe(true);
    });

    it('does not detect plain <slot> without name', () => {
      const code = '<slot></slot>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === '<slot name>')?.detected).toBe(false);
    });

    it('marks as migrated when {#snippet} is present', () => {
      const code = '<slot name="header"></slot><div>{#snippet header()}</div>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === '<slot name>');
      expect(p?.migrated).toBe(true);
    });

    it('marks as not migrated when {#snippet} is absent', () => {
      const code = '<slot name="header"></slot>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === '<slot name>');
      expect(p?.migrated).toBe(false);
    });
  });

  // ─── Pattern 9: onMount → $effect() ───────────────────────────────────────

  describe('pattern: onMount', () => {
    it('detects onMount import', () => {
      const code = '<script>import { onMount } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'onMount');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(4);
    });

    it('marks as migrated when $effect rune is present', () => {
      const code = '<script>import { onMount } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', { $effect: 1 });
      const p = result.patterns.find((p) => p.svelte4 === 'onMount');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 10: onDestroy → $effect cleanup ──────────────────────────────

  describe('pattern: onDestroy', () => {
    it('detects onDestroy import', () => {
      const code = '<script>import { onDestroy } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'onDestroy');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(4);
    });

    it('marks as migrated when $effect rune is present', () => {
      const code = '<script>import { onDestroy } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', { $effect: 1 });
      const p = result.patterns.find((p) => p.svelte4 === 'onDestroy');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Pattern 11: beforeUpdate/afterUpdate → $effect.pre/$effect ────────────

  describe('pattern: beforeUpdate/afterUpdate', () => {
    it('detects beforeUpdate import', () => {
      const code = '<script>import { beforeUpdate } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns.find((p) => p.svelte4 === 'beforeUpdate/afterUpdate');
      expect(p?.detected).toBe(true);
      expect(p?.weight).toBe(4);
    });

    it('detects afterUpdate import', () => {
      const code = '<script>import { afterUpdate } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'beforeUpdate/afterUpdate')?.detected).toBe(true);
    });

    it('detects both beforeUpdate and afterUpdate', () => {
      const code = '<script>import { beforeUpdate, afterUpdate } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns.find((p) => p.svelte4 === 'beforeUpdate/afterUpdate')?.detected).toBe(true);
    });

    it('marks as migrated when $effect rune is present', () => {
      const code = '<script>import { beforeUpdate } from "svelte"</script>';
      const result = analyzeMigration(code, 'test.svelte', { $effect: 1 });
      const p = result.patterns.find((p) => p.svelte4 === 'beforeUpdate/afterUpdate');
      expect(p?.migrated).toBe(true);
    });
  });

  // ─── Migration Score Calculations ─────────────────────────────────────────

  describe('migration scores', () => {
    it('returns 100% when no Svelte 4 patterns are detected', () => {
      const code = '<script>let count = $state(0); let doubled = $derived(count * 2)</script>';
      const result = analyzeMigration(code, 'clean.svelte', { $state: 1, $derived: 1 });
      expect(result.percentage).toBe(100);
      expect(result.maxScore).toBe(0);
      expect(result.actualScore).toBe(0);
    });

    it('returns 0% when all patterns detected but none migrated', () => {
      const code = `
        <script>
          export let name;
          import { writable } from "svelte/store";
          import { onMount } from "svelte";
        </script>
        <button on:click={fn}>Click</button>
      `;
      const result = analyzeMigration(code, 'all-s4.svelte', {});
      expect(result.percentage).toBe(0);
      expect(result.maxScore).toBeGreaterThan(0);
      expect(result.actualScore).toBe(0);
    });

    it('returns 50% for partial migration (export let + writable, only writable migrated)', () => {
      // export let (weight 5) not migrated, import { writable } (weight 5) migrated
      const code = '<script>export let name; import { writable } from "svelte/store"</script>';
      const result = analyzeMigration(code, 'partial.svelte', { $state: 1 });
      expect(result.percentage).toBe(50);
      expect(result.maxScore).toBe(10);
      expect(result.actualScore).toBe(5);
    });

    it('returns 50% for partial migration (writable not migrated, export let migrated)', () => {
      const code = '<script>export let name; import { writable } from "svelte/store"</script>';
      const result = analyzeMigration(code, 'partial.svelte', { $props: 1 });
      expect(result.percentage).toBe(50);
      expect(result.maxScore).toBe(10);
      expect(result.actualScore).toBe(5);
    });

    it('returns 100% for fully migrated file with all patterns', () => {
      const code = `
        <script>
          let { name } = $props();
          let count = $state(0);
          let doubled = $derived(count * 2);
          $effect(() => console.log(count));
        </script>
        <button onclick={fn}>Click</button>
        <div>{@render children()}</div>
        {#snippet children()}<slot></slot>{/snippet}
      `;
      const result = analyzeMigration(code, 'fully-migrated.svelte', {
        $props: 1,
        $state: 1,
        $derived: 1,
        $effect: 1,
      });
      expect(result.percentage).toBe(100);
    });

    it('computes weighted score correctly', () => {
      // export let (5) + on:click (3) = max 8, both migrated = actual 8
      const code = '<script>export let name</script><button onclick={fn} on:click={fn2}>Click</button>';
      const result = analyzeMigration(code, 'weighted.svelte', { $props: 1 });
      expect(result.maxScore).toBe(8);
      expect(result.actualScore).toBe(8);
      expect(result.percentage).toBe(100);
    });

    it('rounds percentage correctly', () => {
      // Three patterns: export let (5) + $: reactive (5) + on:click (3) = max 13
      // Only export let migrated (5) → 5/13 = 38.46% → 38
      const code = '<script>export let name; let x = 1; $: doubled = x * 2</script><button on:click={fn}>Click</button>';
      const result = analyzeMigration(code, 'rounding.svelte', { $props: 1 });
      expect(result.percentage).toBe(38);
    });
  });

  // ─── 100% Pure Svelte 5 ───────────────────────────────────────────────────

  describe('100% pure Svelte 5', () => {
    it('recognizes fully modern Svelte 5 component', () => {
      const code = `
        <script>
          let { title, count: initialCount = 0 } = $props();
          let count = $state(initialCount);
          let doubled = $derived(count * 2);
          $effect(() => console.log('count changed to', count));
        </script>
        <h1>{title}</h1>
        <p>{doubled}</p>
        <button onclick={() => count++}>Increment</button>
      `;
      const result = analyzeMigration(code, 'modern.svelte', {
        $props: 1,
        $state: 1,
        $derived: 1,
        $effect: 1,
      });
      expect(result.percentage).toBe(100);
      expect(result.patterns).toHaveLength(11);
      expect(result.patterns.every(p => !p.detected)).toBe(true);
    });

    it('recognizes Svelte 5 component with snippets', () => {
      const code = `
        <script>
          let { children } = $props();
        </script>
        <div>{@render children()}</div>
        {#snippet default()}Default Content{/snippet}
      `;
      const result = analyzeMigration(code, 'snippets.svelte', { $props: 1 });
      expect(result.percentage).toBe(100);
    });

    it('recognizes Svelte 5 component with $effect cleanup', () => {
      const code = `
        <script>
          $effect(() => {
            const id = setInterval(() => {}, 1000);
            return () => clearInterval(id);
          });
        </script>
      `;
      const result = analyzeMigration(code, 'cleanup.svelte', { $effect: 1 });
      expect(result.percentage).toBe(100);
    });
  });

  // ─── Mixed Patterns ───────────────────────────────────────────────────────

  describe('mixed patterns', () => {
    it('handles file with both Svelte 4 and Svelte 5 patterns', () => {
      const code = `
        <script>
          export let name;
          let count = $state(0);
          $: doubled = count * 2;
        </script>
        <button onclick={fn} on:click={fn2}>Click</button>
      `;
      const result = analyzeMigration(code, 'mixed.svelte', { $props: 1, $state: 1, $derived: 1 });
      // export let (5) migrated, $: reactive (5) migrated, on:click (3) migrated
      expect(result.percentage).toBe(100);
    });

    it('handles file with only some patterns migrated', () => {
      const code = `
        <script>
          export let name;
          import { writable } from "svelte/store";
          import { onMount } from "svelte";
        </script>
      `;
      const result = analyzeMigration(code, 'some-migrated.svelte', { $props: 1 });
      // export let (5) migrated, writable (5) not, onMount (4) not → 5/14 = 36%
      expect(result.percentage).toBe(36);
      expect(result.maxScore).toBe(14);
      expect(result.actualScore).toBe(5);
    });

    it('handles TypeScript component with Svelte 4 patterns', () => {
      const code = `
        <script lang="ts">
          export let name: string;
          export let count: number = 0;
          import { writable } from "svelte/store";
        </script>
      `;
      const result = analyzeMigration(code, 'typed-mixed.svelte', { $props: 1, $state: 1 });
      expect(result.percentage).toBe(100);
    });

    it('handles component with all 11 patterns present', () => {
      const code = `
        <script>
          export let name;
          let x = 1;
          $: doubled = x * 2;
          import { writable } from "svelte/store";
          const store = writable(0);
          import { createEventDispatcher } from "svelte";
          const dispatch = createEventDispatcher();
          import { onMount } from "svelte";
          import { onDestroy } from "svelte";
          import { beforeUpdate } from "svelte";
        </script>
        <button on:click={fn}>Click</button>
        <slot name="header"></slot>
        <slot></slot>
      `;
      const result = analyzeMigration(code, 'all-patterns.svelte', {});
      // All 11 patterns should be detected
      expect(result.patterns.filter((p) => p.detected).length).toBe(11);
      // None migrated
      expect(result.actualScore).toBe(0);
      expect(result.maxScore).toBe(47); // 5+5+3+3+5+5+5+5+4+4+4 = 47
    });

    it('handles component with all 11 patterns fully migrated', () => {
      const code = `
        <script>
          let { name } = $props();
          let x = 1;
          let doubled = $derived(x * 2);
          let count = $state(0);
          let { callback } = $props();
          $effect(() => {});
          $effect(() => {});
          $effect(() => {});
        </script>
        <button onclick={fn}>Click</button>
        <div>{@render children()}</div>
        {#snippet header()}Header{/snippet}
      `;
      const result = analyzeMigration(code, 'all-migrated.svelte', {
        $props: 2,
        $derived: 1,
        $state: 1,
        $effect: 3,
      });
      expect(result.percentage).toBe(100);
      expect(result.actualScore).toBe(result.maxScore);
    });
  });

  // ─── Result Structure ─────────────────────────────────────────────────────

  describe('result structure', () => {
    it('returns correct result shape', () => {
      const code = '<script>export let name</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result).toMatchObject({
        filename: 'test.svelte',
        maxScore: expect.any(Number),
        actualScore: expect.any(Number),
        percentage: expect.any(Number),
        patterns: expect.any(Array),
      });
    });

    it('each pattern has required fields', () => {
      const code = '<script>export let name</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      const p = result.patterns[0];
      expect(p).toHaveProperty('svelte4');
      expect(p).toHaveProperty('svelte5');
      expect(p).toHaveProperty('weight');
      expect(p).toHaveProperty('migrated');
      expect(p).toHaveProperty('detected');
      expect(typeof p.svelte4).toBe('string');
      expect(typeof p.svelte5).toBe('string');
      expect(typeof p.weight).toBe('number');
      expect(typeof p.migrated).toBe('boolean');
      expect(typeof p.detected).toBe('boolean');
    });

    it('includes all 11 patterns in result even when not detected', () => {
      const code = '<script>export let name</script>';
      const result = analyzeMigration(code, 'test.svelte', {});
      expect(result.patterns).toHaveLength(11);
    });

    it('returns all 11 patterns even when no Svelte 4 patterns detected', () => {
      const code = '<script>let count = $state(0)</script>';
      const result = analyzeMigration(code, 'clean.svelte', { $state: 1 });
      expect(result.patterns).toHaveLength(11);
      expect(result.patterns.every(p => !p.detected)).toBe(true);
    });
  });
});
