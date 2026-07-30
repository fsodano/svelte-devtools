import type { Plugin } from 'vite';
import type { PluginAPI } from '../types.js';
import { toRollupError } from '../utils/error.js';
import { getStableId } from '../utils/options.js';
import { shouldProcessSvelte } from '../utils/id.js';
import MagicString from 'magic-string';
import { parse as parseJS } from '@babel/parser';
import * as t from '@babel/types';
import { parse } from 'svelte/compiler';
import type { StateDeclaration } from '@svelte-devtools/types';
import { analyzeMigration } from '../migration-analyzer.js';

export function transform(api: PluginAPI): Plugin {
  const plugin: Plugin = {
    name: 'svelte-devtools:transform',
    enforce: 'pre',
    apply: 'serve',

    configResolved() {
      // Set hook-level transform filter — Vite skips the handler entirely for non-matching files
      if (api.filter) {
        (plugin as unknown as Record<string, unknown>).transform = {
          filter: { id: api.filter },
          handler: transformHandler,
        };
      }
    },

    applyToEnvironment(env: { config: { consumer: string } }) {
      // Only run transforms on the client environment
      return env.config.consumer === 'client';
    },
  };

  async function transformHandler(code: string, id: string): Promise<{ code: string; map: ReturnType<typeof import('magic-string').default.prototype.generateMap> } | null> {
    if (!api.options) return null;
    if (!shouldProcessSvelte(id, api.filter || (() => false))) return null;

    if (api.isDebug) console.log('[Svelte DevTools] Transforming:', id);

    const s = new MagicString(code);
    const componentName = id.split('/').pop()?.replace('.svelte', '') || 'Unknown';
    const componentId = getStableId(id, api.root);
    const runeCounts: Record<string, number> = {};
    const propKeys: string[] = [];

    try {
      injectStateInspection(s, code, id, componentId, runeCounts, propKeys);
      injectComponentMetadata(s, code, componentId, componentName, id, propKeys);
      injectEffectTracking(s, code, id, componentId, runeCounts);
    } catch (e) {
      // Surface error through Vite's error overlay instead of silent return null
      throw toRollupError(e, { isBuild: false, isDebug: api.isDebug });
    }

    const migrationResult = analyzeMigration(code, id, runeCounts);
    api.componentRegistry.set(componentId, {
      id: componentId,
      name: componentName,
      filename: id,
      runeCounts,
      propKeys,
      migrationResult,
    });

    if (migrationResult && migrationResult.percentage < 50 && api.logsApi && typeof api.logsApi.add === 'function') {
      api.logsApi.add({
        message: `${componentName} is ${migrationResult.percentage}% migrated`,
        description: `${migrationResult.patterns.length} Svelte 4 pattern(s) found: ${migrationResult.patterns.map((p: { svelte4: string }) => p.svelte4).join(', ')}`,
        level: 'warn',
        category: 'svelte-migration',
      } as unknown);
    }

    if (api.batchTimer) clearTimeout(api.batchTimer);
    api.batchTimer = setTimeout(() => {
      if (!api.logsApi || typeof api.logsApi.add !== 'function') return;
      const total = api.componentRegistry.size;
      const totalRunes = Array.from(api.componentRegistry.values())
        .reduce((sum, m) => sum + Object.values(m.runeCounts ?? {}).reduce((a: number, b: number) => a + b, 0), 0);
      api.logsApi.add({
        message: `Registered ${total} component${total === 1 ? '' : 's'} (${totalRunes} rune trackings)`,
        level: 'info',
        category: 'svelte-devtools',
        autoDelete: 8000,
      } as unknown);
    }, 2000);

    return s.hasChanged() ? { code: s.toString(), map: s.generateMap({ hires: true }) } : null;
  }

  return plugin;
}

// ============================================================================
// INJECTION FUNCTIONS (UNCHANGED from original index.ts)
// ============================================================================

interface SvelteAst {
  instance?: {
    content: { start: number; end: number };
  };
}

function parseSvelte(code: string, filename: string): SvelteAst | null {
  try {
    return parse(code, { filename, modern: true }) as unknown as SvelteAst;
  } catch {
    return null;
  }
}

function extractScript(code: string, ast: { instance?: { content: { start: number; end: number } } }): { scriptContent: string; scriptStart: number } {
  if (ast.instance) {
    return {
      scriptStart: ast.instance.content.start,
      scriptContent: code.slice(ast.instance.content.start, ast.instance.content.end),
    };
  }
  const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
  if (!match) return { scriptContent: '', scriptStart: 0 };
  return {
    scriptStart: match.index + match[0].indexOf(match[1]),
    scriptContent: match[1],
  };
}

function parseJavaScript(code: string): t.File | null {
  try {
    return parseJS(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch {
    return null;
  }
}

function injectComponentMetadata(s: MagicString, code: string, componentId: string, componentName: string, filename: string, propKeys?: string[]): void {
  const propKeysJson = JSON.stringify(propKeys || []);
  const registryInj = `if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_REGISTRY__||=new Map();window.__SVELTE_DEVTOOLS_REGISTRY__.set('${componentId}',{id:'${componentId}',name:'${componentName}',filename:'${filename}',propKeys:${propKeysJson}})}`;
  // init.ts guarantees __SVELTE_DEVTOOLS_RUNTIME__ exists — no guard needed
  const runtimeInj = `if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_RUNTIME__.registerComponent('${componentId}','${componentName}','${filename}');}`;
  const combinedInj = registryInj + runtimeInj;

  const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(code);
  if (match) s.appendLeft(match.index + match[0].indexOf('>') + 1, combinedInj);
  else s.prepend(`<script>${combinedInj}</script>`);

  const search = code.replace(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/gi, (m, _, c) => m.replace(c, ' '.repeat(c.length)));
  const tagRegex = /<([a-zA-Z0-9-:]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(search)) !== null) {
    const tn = m[1].toLowerCase();
    if (['script', 'style', 'title', 'meta', 'link', 'base'].includes(tn) || tn.startsWith('svelte:')) continue;
    s.appendLeft(m.index + m[0].length, ` data-svelte-devtools-id="${componentId}" data-svelte-component="${componentName}"`);
    break;
  }
}

function injectStateInspection(s: MagicString, code: string, filename: string, componentId: string, runeCounts: Record<string, number>, propKeys?: string[]): void {
  const ast = parseSvelte(code, filename);
  if (!ast) return;

  const { scriptContent, scriptStart } = extractScript(code, ast);
  if (!scriptContent) return;

  const jsAst = parseJavaScript(scriptContent);
  if (!jsAst) return;

  const decls = findStateDeclarations(jsAst, scriptStart, runeCounts, propKeys);

  decls.sort((a, b) => b.injectPos - a.injectPos);

  for (const d of decls) {
    const injectCode = createInjectCode(d, componentId);
    s.appendLeft(d.injectPos, injectCode);
  }
}

function createInjectCode(d: StateDeclaration, componentId: string): string {
  if (d.isClassInstance) {
    // Spring/Tween setter — registers setter via passive buffer queue (no _fn wrapper needed)
    return `;if(typeof window!=='undefined'){window.__SVELTE_DEVTOOLS_RUNTIME__._registerState('${componentId}','${d.key}',function(v){var s=${d.key};if(s&&v&&typeof v==='object'){var _val=v.current!==void 0?v.current:(v.target!==void 0?v.target:v);if(typeof s.set==='function'){s.set(_val,{hard:true})}else{if(v.target!==void 0)s.target=v.target;if(v.current!==void 0)s.current=v.current}}})};{$effect(()=>{const s=${d.key};window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${d.key}','update',{current:s?.current,target:s?.target,stiffness:s?.stiffness,damping:s?.damping})})}`;
  }
  const skipSetter = d.callee === '$derived' && d.isConst;
  const setterReg = skipSetter
    ? ''
    : `;window.__SVELTE_DEVTOOLS_RUNTIME__._registerState('${componentId}','${d.key}',(v)=>{${d.key}=v});`;
  // Leading ; ensures $inspect is a separate statement when no setterReg
  // WARNING: $inspect textually before $derived can break Svelte 5 reactivity.
  // The compile-order fix: inject $inspect AFTER the declaration by appending
  // it to the setterReg string (which will be placed before the declaration
  // in the appendLeft call) but wrapped in a microtask deferral.

  // TEMPORARY DEBUG: Try injecting inspect AFTER the declaration
  return `${setterReg};if(typeof $inspect!=='undefined'){$inspect(${d.key}).with((t,...v)=>{window.__SVELTE_DEVTOOLS_RUNTIME__.handleState('${componentId}','${d.key}',t,v[0])})};`;
}

function findStateDeclarations(ast: t.File, offset: number, runeCounts: Record<string, number>, propKeys?: string[]): StateDeclaration[] {
  const result: StateDeclaration[] = [];

  t.traverse(ast, {
    enter(node) {
      if (!t.isVariableDeclaration(node)) return;

      for (const decl of node.declarations) {
        if (!decl.init) continue;

        extractRuneDeclarations(decl, offset, result, runeCounts, propKeys, node.kind === 'const');
        extractMotionDeclaration(decl, offset, result);
      }
    },
  });

  return result;
}

function extractRuneDeclarations(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[], runeCounts: Record<string, number>, propKeys?: string[], isConst = false): void {
  if (!t.isCallExpression(decl.init)) return;

  if (t.isMemberExpression(decl.init.callee)) {
    if (t.isIdentifier(decl.init.callee.object) && decl.init.callee.object.name === '$effect' &&
        t.isIdentifier(decl.init.callee.property) && decl.init.callee.property.name === 'pre') {
      runeCounts['$effect.pre'] = (runeCounts['$effect.pre'] || 0) + 1;
    }
    return;
  }

  if (!t.isIdentifier(decl.init.callee)) return;

  const callee = decl.init.callee.name;
  if (!['$state', '$derived', '$props', '$effect', '$effect.pre', '$bindable', 'untrack', '$host'].includes(callee)) return;

  runeCounts[callee] = (runeCounts[callee] || 0) + 1;

  if (callee === 'untrack' || callee === '$host') return;

  const pos = decl.init.end;
  if (pos == null) return;

  if (t.isIdentifier(decl.id)) {
    result.push({ key: decl.id.name, injectPos: offset + pos, isClassInstance: false, callee, isConst });
    return;
  }

  if (t.isObjectPattern(decl.id)) {
    for (const prop of decl.id.properties) {
      if (t.isObjectProperty(prop)) {
        if (t.isIdentifier(prop.key)) {
          const actualName = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name;
          result.push({ key: actualName, injectPos: offset + pos, isClassInstance: false, callee, isConst });
          if (callee === '$props' && propKeys) {
            propKeys.push(actualName);
          }
        }
      } else if (t.isRestElement(prop)) {
        if (t.isIdentifier(prop.argument)) {
          result.push({ key: prop.argument.name, injectPos: offset + pos, isClassInstance: false });
        }
      }
    }

    if (callee === '$props') {
      for (const prop of decl.id.properties) {
        if (t.isObjectProperty(prop) && t.isAssignmentPattern(prop.value)) {
          const right = prop.value.right;
          if (t.isCallExpression(right) && t.isIdentifier(right.callee) && right.callee.name === '$bindable') {
            runeCounts['$bindable'] = (runeCounts['$bindable'] || 0) + 1;
          }
        }
      }
    }

    return;
  }

  if (t.isArrayPattern(decl.id)) {
    for (const element of decl.id.elements) {
      if (t.isIdentifier(element)) {
        result.push({ key: element.name, injectPos: offset + pos, isClassInstance: false });
      } else if (t.isRestElement(element)) {
        if (t.isIdentifier(element.argument)) {
          result.push({ key: element.argument.name, injectPos: offset + pos, isClassInstance: false });
        }
      } else if (t.isAssignmentPattern(element)) {
        if (t.isIdentifier(element.left)) {
          result.push({ key: element.left.name, injectPos: offset + pos, isClassInstance: false });
        }
      }
    }
  }
}

function extractMotionDeclaration(decl: t.VariableDeclarator, offset: number, result: StateDeclaration[]): void {
  if (!t.isIdentifier(decl.id)) return;
  if (!t.isNewExpression(decl.init)) return;
  if (!t.isIdentifier(decl.init.callee)) return;

  const callee = decl.init.callee.name;
  if (!['Spring', 'Tween'].includes(callee)) return;

  const pos = decl.init.end;
  if (pos != null) {
    result.push({ key: decl.id.name, injectPos: offset + pos, isClassInstance: true });
  }
}

function injectEffectTracking(s: MagicString, code: string, filename: string, componentId: string, runeCounts: Record<string, number>): void {
  const ast = parseSvelte(code, filename);
  if (!ast) return;

  const { scriptContent, scriptStart } = extractScript(code, ast);
  if (!scriptContent) return;

  const jsAst = parseJavaScript(scriptContent);
  if (!jsAst) return;

  const trackedPositions: { start: number; end: number; name: string }[] = [];

  t.traverse(jsAst, {
    enter(node) {
      if (!t.isExpressionStatement(node)) return;
      if (!t.isCallExpression(node.expression)) return;

      let callee: string | null = null;

      if (t.isMemberExpression(node.expression.callee)) {
        if (t.isIdentifier(node.expression.callee.object) && node.expression.callee.object.name === '$effect' &&
            t.isIdentifier(node.expression.callee.property) && node.expression.callee.property.name === 'pre') {
          callee = '$effect.pre';
        }
      } else if (t.isIdentifier(node.expression.callee)) {
        callee = node.expression.callee.name;
      }

      if (!callee) return;

      if (callee === '$effect' || callee === '$effect.pre') {
        runeCounts[callee] = (runeCounts[callee] || 0) + 1;
        if (node.expression.start != null && node.expression.end != null) {
          trackedPositions.push({
            start: node.expression.start,
            end: node.expression.end,
            name: callee,
          });
        }
      } else if (callee === 'untrack') {
        runeCounts['untrack'] = (runeCounts['untrack'] || 0) + 1;
      }
    },
  });

  t.traverse(jsAst, {
    enter(node) {
      if (!t.isCallExpression(node)) return;
      if (!t.isMemberExpression(node.callee)) return;
      if (!t.isIdentifier(node.callee.object)) return;
      if (node.callee.object.name !== '$state') return;
      if (!t.isIdentifier(node.callee.property)) return;

      const member = node.callee.property.name;
      if (member === 'snapshot' || member === 'fsync') {
        runeCounts[`$state.${member}`] = (runeCounts[`$state.${member}`] || 0) + 1;
      }
    },
  });

  trackedPositions.sort((a, b) => b.start - a.start);

  for (const { start, end, name } of trackedPositions) {
    const bodyStart = scriptStart + start;
    const callText = code.slice(scriptStart + start, scriptStart + end);
    const fnMatch = callText.match(/^\$effect(?:\.pre)?\s*\(\s*(?:async\s*)?\(\s*\)\s*(?::\s*\w+\s*)?=>\s*\{/);
    if (!fnMatch) continue;

    const bodyOffset = scriptStart + start + (fnMatch[0]?.length || 0);
    const effectKey = `effect_${runeCounts[name]}`;
    const injectCode = `window.__SVELTE_DEVTOOLS_RUNTIME__.handleEffect('${componentId}','${effectKey}','${name}','${filename.replace(/'/g, "\\'")}');`;

    s.appendLeft(bodyOffset, injectCode);
  }
}
