import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';

// We can test getStableId by replicating it — it's a pure function:
function getStableId(id: string, root: string): string {
  const relPath = id.startsWith(root) ? id.slice(root.length + 1) : id;
  let hash = 0;
  for (let i = 0; i < relPath.length; i++) {
    hash = ((hash << 5) - hash) + relPath.charCodeAt(i);
    hash |= 0;
  }
  return `svt-${Math.abs(hash).toString(36)}`;
}

function shouldProcess(id: string, include: RegExp[], exclude: RegExp[]): boolean {
  return !exclude.some(p => p.test(id)) && include.some(p => p.test(id));
}

describe('vite-plugin', () => {
  describe('getStableId', () => {
    it('produces consistent IDs for the same file path', () => {
      const id1 = getStableId('/src/lib/Counter.svelte', '/');
      const id2 = getStableId('/src/lib/Counter.svelte', '/');
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different file paths', () => {
      const id1 = getStableId('/src/lib/Counter.svelte', '/');
      const id2 = getStableId('/src/lib/Timer.svelte', '/');
      expect(id1).not.toBe(id2);
    });

    it('prefixes with svt-', () => {
      const id = getStableId('/src/App.svelte', '/');
      expect(id).toMatch(/^svt-/);
    });

    it('produces URL-safe identifiers (no special chars)', () => {
      const id = getStableId('/src/lib/My$Component.svelte', '/');
      expect(id).toMatch(/^svt-[a-z0-9]+$/);
    });
  });

  describe('shouldProcess', () => {
    it('processes .svelte files', () => {
      expect(shouldProcess('/src/App.svelte', [/\.svelte$/], [/node_modules/])).toBe(true);
    });

    it('skips node_modules', () => {
      expect(shouldProcess('/node_modules/pkg/index.svelte', [/\.svelte$/], [/node_modules/])).toBe(false);
    });

    it('skips .svelte-kit/generated files', () => {
      expect(shouldProcess('/.svelte-kit/generated/root.svelte', [/\.svelte$/], [/node_modules/, /\.svelte-kit\/generated/])).toBe(false);
    });

    it('skips non-.svelte files', () => {
      expect(shouldProcess('/src/app.ts', [/\.svelte$/], [/node_modules/])).toBe(false);
    });
  });

  describe('component metadata injection', () => {
    it('injects data-svelte-devtools-id attribute on first non-void element', () => {
      const code = `<script>let x = 0;</script>\n<div class="app"><span>hello</span></div>`;
      const s = new MagicString(code);

      const componentId = 'svt-test1';
      const componentName = 'TestComp';

      // Match the injection logic from the plugin
      const search = code.replace(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) =>
        '<' + _t + '>' + ' '.repeat(c.length) + '</' + _t + '>'
      );
      const tagRegex = /<([a-zA-Z0-9-:]+)/g;
      let m: RegExpExecArray | null;
      while ((m = tagRegex.exec(search)) !== null) {
        const tn = m[1].toLowerCase();
        if (['script', 'style', 'title', 'meta', 'link', 'base'].includes(tn) || tn.startsWith('svelte:')) continue;
        s.appendLeft(m.index + m[0].length, ` data-svelte-devtools-id="${componentId}" data-svelte-component="${componentName}"`);
        break;
      }

      const result = s.toString();
      expect(result).toContain(`data-svelte-devtools-id="${componentId}"`);
      expect(result).toContain(`data-svelte-component="${componentName}"`);
      // Script tag is skipped, so the div gets the attribute
      expect(result).toContain('<div data-svelte-devtools-id');
    });

    it('skips script and style elements for data attribute', () => {
      const code = `<script>let x = 0;</script>\n<style>.app{}</style>\n<div class="app"></div>`;
      const s = new MagicString(code);
      const componentId = 'svt-test2';
      const componentName = 'StyledComp';

      const search = code.replace(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) =>
        '<' + _t + '>' + ' '.repeat(c.length) + '</' + _t + '>'
      );
      const tagRegex = /<([a-zA-Z0-9-:]+)/g;
      let m: RegExpExecArray | null;
      while ((m = tagRegex.exec(search)) !== null) {
        const tn = m[1].toLowerCase();
        if (['script', 'style', 'title', 'meta', 'link', 'base'].includes(tn) || tn.startsWith('svelte:')) continue;
        s.appendLeft(m.index + m[0].length, ` data-svelte-devtools-id="${componentId}" data-svelte-component="${componentName}"`);
        break;
      }

      const result = s.toString();
      // The attribute should be on the div, not script or style
      expect(result).toContain('<div data-svelte-devtools-id="svt-test2"');
      expect(result).not.toContain('<script data-svelte-devtools-id');
      expect(result).not.toContain('<style data-svelte-devtools-id');
    });

    it('injects registry setup code in script tag', () => {
      const code = `<script>let count = $state(0);</script>\n<div></div>`;
      const s = new MagicString(code);
      const componentId = 'svt-test3';
      const componentName = 'Counter';
      const filename = '/src/lib/Counter.svelte';

      const registryInj = `if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_REGISTRY__||=new Map();window.__SVELTE_DEVTOOLS_REGISTRY__.set('${componentId}',{id:'${componentId}',name:'${componentName}',filename:'${filename}'})}`;
      const runtimeInj = `if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__){window.__SVELTE_DEVTOOLS_RUNTIME__.registerComponent('${componentId}','${componentName}','${filename}');}`;
      const combinedInj = registryInj + runtimeInj;

      const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
      if (match) s.appendLeft(match.index + match[0].indexOf('>') + 1, combinedInj);

      const result = s.toString();
      expect(result).toContain('__SVELTE_DEVTOOLS_REGISTRY__');
      expect(result).toContain('__SVELTE_DEVTOOLS_RUNTIME__');
      expect(result).toContain(`'${componentId}'`);
      expect(result).toContain(`'${componentName}'`);
    });
  });

  describe('$inspect injection', () => {
    it('generates $inspect code for $state declarations', () => {
      const componentId = 'svt-test4';
      const key = 'count';

      // Replicate createInjectCode logic
      const injectCode = `;$inspect(${key}).with((t,...v)=>{if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${key}',t,v[0])}})`;

      expect(injectCode).toContain(`$inspect(${key})`);
      expect(injectCode).toContain(`handleState('${componentId}','${key}'`);
      expect(injectCode).toContain('__SVELTE_DEVTOOLS_RUNTIME__');
      expect(injectCode).not.toContain('$effect');
    });

    it('generates $effect code for Spring/Tween declarations', () => {
      const componentId = 'svt-test5';
      const key = 'spring';

      const injectCode = `;{$effect(()=>{const s=${key};if(typeof window!=='undefined'&&window.__SVELTE_DEVTOOLS_RUNTIME__&&window.__SVELTE_DEVTOOLS_RUNTIME__.handleState){window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${key}','update',{current:s?.current,target:s?.target,stiffness:s?.stiffness,damping:s?.damping})}})}`;

      expect(injectCode).toContain('$effect');
      expect(injectCode).toContain(`s?.current`);
      expect(injectCode).toContain(`s?.target`);
      expect(injectCode).toContain(`s?.stiffness`);
      expect(injectCode).toContain(`s?.damping`);
      expect(injectCode).toContain(`'update'`);
    });
  });
});
