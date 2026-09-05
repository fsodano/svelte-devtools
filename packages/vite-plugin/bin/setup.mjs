#!/usr/bin/env node
/** Configure standard Vite/Svelte and SvelteKit apps without evaluating user code. */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';

const packageName = '@fsodano/vite-plugin-svelte-devtools';
const guide = 'https://github.com/fsodano/svelte-devtools/blob/main/docs/02_vite-plugin.md#installation';
const hook = `import { dev } from '$app/environment';
import { svelteDevToolsHandle, noopHandle } from '${packageName}/sveltekit';

export const handle = dev ? svelteDevToolsHandle() : noopHandle();
`;
const syntax = (source) => parse(source, { sourceType: 'module', plugins: ['typescript'] }).program;
const unwrap = (node) => ['TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(node?.type) ? unwrap(node.expression) : node;
const key = (node) => !node.computed && (node.key?.name ?? node.key?.value);
const fail = (message) => { throw new Error(`${message}\nNo files changed. Follow the manual setup: ${guide}`); };

/** Return all edits first. Unsupported configurations never receive partial edits. */
export function planSetup(root) {
  const manifestPath = resolve(root, 'package.json');
  if (!existsSync(manifestPath)) fail('Run this command in the application directory containing package.json.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (!dependencies[packageName] || !dependencies['@vitejs/devtools']) {
    fail(`Install the plugin and host first:\n  npm install -D ${packageName} @vitejs/devtools@0.4.8`);
  }
  const files = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'].filter(file => existsSync(resolve(root, file)));
  if (files.length !== 1) fail('Expected one standard vite.config.ts, .js, .mts, or .mjs file.');
  const configPath = resolve(root, files[0]);
  const source = readFileSync(configPath, 'utf8');
  const program = syntax(source);
  const imports = program.body.filter(node => node.type === 'ImportDeclaration');
  const binding = (module, name) => imports.filter(node => node.source.value === module).flatMap(node => node.specifiers)
    .find(node => node.type === 'ImportSpecifier' && (node.imported.name ?? node.imported.value) === name)?.local.name;
  const kit = binding('@sveltejs/kit/vite', 'sveltekit');
  const svelte = binding('@sveltejs/vite-plugin-svelte', 'svelte');
  if (!kit && !svelte) fail('Could not find the standard sveltekit() or svelte() import.');
  const exported = unwrap(program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration);
  const defineConfig = binding('vite', 'defineConfig');
  const config = unwrap(exported?.type === 'CallExpression' && exported.callee.name === defineConfig ? exported.arguments[0] : exported);
  if (config?.type !== 'ObjectExpression') fail('Automatic setup requires an exported config object or defineConfig({...}).');
  if (config.properties.some(node => node.type !== 'ObjectProperty' || node.computed)) fail('Config spreads, methods, and computed properties require manual setup.');
  const pluginProperties = config.properties.filter(node => key(node) === 'plugins');
  const plugins = pluginProperties[0]?.value;
  if (pluginProperties.length !== 1 || plugins?.type !== 'ArrayExpression') fail('Automatic setup requires one plugins: [...] array.');
  const integration = plugins.elements.filter(node => node?.type === 'CallExpression' && [kit, svelte].filter(Boolean).includes(node.callee.name));
  if (integration.length !== 1) fail('Expected one direct sveltekit() or svelte() call in plugins.');
  const isKit = !!kit && integration[0].callee.name === kit;
  if (isKit) {
    // Custom paths can live in either current inline options or legacy svelte.config.*.
    const customFiles = /\bfiles\s*:/;
    if (customFiles.test(source) || ['js', 'ts', 'mjs', 'mts'].some(ext => {
      const path = resolve(root, `svelte.config.${ext}`);
      return existsSync(path) && customFiles.test(readFileSync(path, 'utf8'));
    })) fail('SvelteKit files options require manual hook setup.');
    if (!existsSync(resolve(root, 'src'))) fail('Expected the standard SvelteKit src directory.');
  }
  const hookPath = resolve(root, `src/hooks.server.${files[0].endsWith('ts') ? 'ts' : 'js'}`);
  const existingHooks = ['ts', 'js'].map(ext => resolve(root, `src/hooks.server.${ext}`)).filter(existsSync);
  if (isKit && existingHooks.some(path => readFileSync(path, 'utf8') !== hook)) {
    fail('An existing server hook needs manual composition with sequence().');
  }
  const hostBinding = binding('@vitejs/devtools', 'DevTools');
  const pluginBinding = binding(packageName, 'svelteDevTools');
  const called = name => !!name && plugins.elements.some(node => node?.type === 'CallExpression' && node.callee.name === name);
  if (hostBinding || pluginBinding || imports.some(node => [packageName, '@vitejs/devtools'].includes(node.source.value))) {
    if (called(hostBinding) && called(pluginBinding)) {
      if (isKit && existingHooks.length === 0) return [{ path: hookPath, content: hook }];
      return [];
    }
    fail('A partial DevTools configuration needs manual setup.');
  }
  // Unique aliases avoid shadowing existing local declarations.
  const unique = base => { let name = base; while (new RegExp(`\\b${name}\\b`).test(source)) name += '_'; return name; };
  const hostName = unique('DevTools');
  const pluginName = unique('svelteDevTools');
  const edited = new MagicString(source);
  edited.prepend(`import { DevTools${hostName === 'DevTools' ? '' : ` as ${hostName}`} } from '@vitejs/devtools';\nimport { svelteDevTools${pluginName === 'svelteDevTools' ? '' : ` as ${pluginName}`} } from '${packageName}';\n`);
  edited.appendLeft(plugins.start + 1, `${hostName}(), `);
  edited.appendLeft(integration[0].end, `, ${pluginName}()`);
  const content = edited.toString();
  syntax(content);
  const changes = [{ path: configPath, content }];
  if (isKit && existingHooks.length === 0) changes.push({ path: hookPath, content: hook });
  return changes;
}

export function main(args = process.argv.slice(2), root = process.cwd()) {
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: svelte-devtools init [--dry-run]\n\nConfigure a standard SvelteKit or Vite + Svelte app.\nPreserves compiler and adapter options. Existing custom hooks need manual setup.');
    return;
  }
  if (args[0] !== 'init' || args.slice(1).some(arg => arg !== '--dry-run')) throw new Error('Usage: svelte-devtools init [--dry-run]');
  const changes = planSetup(resolve(root));
  if (args.includes('--dry-run')) {
    for (const change of changes) console.log(`\n--- ${change.path}\n${change.content}`);
    console.log(changes.length ? 'Preview only. No files changed.' : 'Svelte DevTools is already configured.');
    return;
  }
  for (const change of changes) {
    writeFileSync(change.path, change.content);
    console.log(`Configured ${change.path}`);
  }
  console.log(`${changes.length ? 'Setup complete.' : 'Svelte DevTools is already configured.'}\nRun npm run dev. Open the app, authorize the Vite dock with the terminal's six-digit devframe code, and select Svelte.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
