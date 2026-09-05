import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { svelteDevTools } from '../../packages/vite-plugin/src/index.js';

function transform(source: string) {
  const plugin = svelteDevTools();
  const result = (plugin.transform as Function)(source, '/src/Counter.svelte');
  expect(result).not.toBeNull();
  return result.code as string;
}

describe('real component identity transform', () => {
  it('tags each owned DOM branch and uses context ancestry for fragment components', () => {
    const code = transform('<script>let visible=$state(true);</script>{#if visible}<div>One</div>{:else}<section>Two</section>{/if}<aside>Another root</aside>');
    expect(code.match(/data-svelte-devtools-id=/g)).toHaveLength(3);
    expect(code).toContain("Symbol.for('svelte-devtools.component-parent')");
    expect(code).toMatch(/parentId:__svt_\w+_parent/);
    for (const generate of ['client', 'server'] as const) {
      expect(() => compile(code, { filename: '/src/Counter.svelte', generate, dev: true })).not.toThrow();
    }
  });

  it('does not mistake markup in comments or expressions for owned DOM', () => {
    const code = transform('<script>let text=$state("<div>example</div>");</script><!-- <span>comment</span> --><p>{text}</p>');
    expect(code.match(/data-svelte-devtools-id=/g)).toHaveLength(1);
    expect(code).toContain('<!-- <span>comment</span> -->');
  });
  it.each([
    '<script>let count = $state(0)</script><button onclick={() => count++}>{count}</button>',
    '<script module>export const answer = 42;</script><script>let count = $state(0)</script><div>{count}</div>',
    '<script>const uid = $props.id(); let count = $state(0)</script><div id={uid}>{count}</div>',
    '<p>Static component</p>',
  ])('compiles instance metadata for client and SSR: %s', source => {
    const code = transform(source);
    expect(code.match(/\$props\.id\(\)/g)).toHaveLength(1);
    expect(code).toContain('unregisterComponent');
    expect(code).toMatch(/data-svelte-devtools-id=\{__svt_/);
    expect(() => compile(code, { filename: '/src/Counter.svelte', generate: 'client', dev: true })).not.toThrow();
    expect(() => compile(code, { filename: '/src/Counter.svelte', generate: 'server', dev: true })).not.toThrow();
  });

  it('uses the same instance expression for inspection and setters', () => {
    const code = transform('<script>let count = $state(0)</script><div>{count}</div>');
    const ref = code.match(/data-svelte-devtools-id=\{([^}]+)\}/)![1];
    expect(code).toContain(`handleState(${ref},'count'`);
    expect(code).toContain(`_registerState(${ref},'count'`);
  });

  it('does not add DOM attributes to a child component invocation', () => {
    const code = transform('<script>import Child from "./Child.svelte";</script><Child/><div>root</div>');
    expect(code).toContain('<Child/>');
    expect(code).toContain('<div data-svelte-devtools-id={');
  });
});


describe('script scope and destructured bindings', () => {
  it.each(['module', 'context="module"'])('leaves %s script state outside instance instrumentation', attribute => {
    const moduleScript = `<script ${attribute}>const shared = $state({ count: 0 });</script>`;
    const code = transform(`${moduleScript}<p>Static markup</p>`);
    expect(code).toContain(moduleScript);
    for (const generate of ['client', 'server'] as const) {
      expect(() => compile(code, { filename: '/src/Counter.svelte', generate, dev: true })).not.toThrow();
    }
  });

  it.each([
    ['const [first] = $state([1])', ['first']],
    ['const [first = 1, , ...rest] = $state([])', ['first', 'rest']],
    ['const { first, ...rest } = $state({ first: 1, second: 2 })', ['first', 'rest']],
    ['const { first: renamed = 1 } = $state({})', ['renamed']],
    ['let { nested: { value }, list: [first] } = $state({ nested: { value: 1 }, list: [2] })', ['value', 'first']],
    ['const { "first": renamed } = $state({ first: 1 })', ['renamed']],
    ['const [first, ...rest] = $derived([1, 2])', ['first', 'rest']],
  ] as const)('compiles bindings and preserves declaration metadata: %s', (declaration, names) => {
    const code = transform(`<script>${declaration};</script><p>Bindings</p>`);
    for (const name of names) expect(code).toContain(`$inspect(${name})`);
    if (declaration.includes('$derived')) expect(code).not.toContain('._registerState(');
    for (const generate of ['client', 'server'] as const) {
      expect(() => compile(code, { filename: '/src/Counter.svelte', generate, dev: true })).not.toThrow();
    }
  });
});
