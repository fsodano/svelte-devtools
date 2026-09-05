import { compileModule } from 'svelte/compiler';
import ts from 'typescript';
import type { Plugin } from 'vite';

/** Compile production rune modules exactly as client code, without mocking runes. */
export function svelteRunesPlugin(): Plugin {
  return {
    name: 'test-svelte-runes',
    enforce: 'pre',
    transform(source, id) {
      if (!/\.svelte\.[jt]s$/.test(id)) return;
      const javascript = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
        fileName: id,
      }).outputText;
      return compileModule(javascript, { filename: id, generate: 'client', dev: true }).js;
    },
  };
}
