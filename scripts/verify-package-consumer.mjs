#!/usr/bin/env node
/** Install real release tarballs outside the workspace and verify consumer entry points. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'svelte-package-consumer-'));
const tarballs = join(directory, 'tarballs');
mkdirSync(tarballs);
const cache = join(tmpdir(), 'svelte-package-consumer-cache');
const run = (command, args, cwd = directory) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
const write = (path, text) => writeFileSync(join(directory, path), text);
console.log(`Consumer artifacts and logs: ${directory}`);
try {
  const packages = JSON.parse(run('npm', ['pack', '--workspaces', '--pack-destination', tarballs, '--cache', cache, '--json'], repository));
  const fixture = JSON.parse(readFileSync(join(repository, 'tests/apps/svelte-kit/package.json'), 'utf8'));
  const dependencies = Object.fromEntries(packages.map(pkg => [pkg.name, `file:./tarballs/${pkg.filename}`]));
  for (const name of ['vite', 'svelte', '@vitejs/devtools', '@sveltejs/vite-plugin-svelte', '@sveltejs/kit', '@sveltejs/adapter-auto', 'typescript']) dependencies[name] = fixture.devDependencies[name];
  dependencies['@types/node'] = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).devDependencies['@types/node'];
  write('package.json', JSON.stringify({ name: 'svelte-release-consumer', private: true, type: 'module', dependencies }, null, 2));
  write('install.log', run('npm', ['install', '--cache', cache, '--no-audit', '--no-fund']));
  for (const app of ['plain', 'kit']) mkdirSync(join(directory, app));
  write('plain/index.html', '<!doctype html><html><head><title>Consumer</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
  write('plain/main.js', "import { mount } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.getElementById('app') });");
  const component = '<script>let count = $state(0);</script><button onclick={() => count++}>Consumer count {count}</button>';
  write('plain/App.svelte', component);
  write('plain/vite.config.js', "import { svelte } from '@sveltejs/vite-plugin-svelte'; import { DevTools } from '@vitejs/devtools'; import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools'; export default { plugins: [DevTools(), svelte(), svelteDevTools()] };");
  mkdirSync(join(directory, 'kit/src/routes'), { recursive: true });
  write('kit/package.json', '{"type":"module"}');
  write('kit/svelte.config.js', "import adapter from '@sveltejs/adapter-auto'; export default { kit: { adapter: adapter() } };");
  write('kit/vite.config.js', "import { sveltekit } from '@sveltejs/kit/vite'; import { DevTools } from '@vitejs/devtools'; import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools'; export default { plugins: [DevTools(), sveltekit(), svelteDevTools()] };");
  write('kit/src/app.html', '<!doctype html><html><head>%sveltekit.head%</head><body><div style="display: contents">%sveltekit.body%</div></body></html>');
  write('kit/src/routes/+page.svelte', component);
  write('kit/src/hooks.server.js', "import { dev } from '$app/environment'; import { svelteDevToolsHandle, noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit'; export const handle = dev ? svelteDevToolsHandle() : noopHandle();");
  write('imports.ts', "import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools'; import { noopHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit'; import { traceSqliteQuery } from '@fsodano/vite-plugin-svelte-devtools/sqlite'; import { createDevtoolsMcpServer } from '@fsodano/svelte-devtools-mcp'; import type { ComponentInstance } from '@fsodano/svelte-devtools-types'; void [svelteDevTools, noopHandle, traceSqliteQuery, createDevtoolsMcpServer]; let component: ComponentInstance | undefined; void component;");
  write('types.log', run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ES2022', 'imports.ts']));
  write('smoke.mjs', String.raw`
import assert from 'node:assert/strict';
import { createServer, preview } from 'vite';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { traceSqliteQuery } from '@fsodano/vite-plugin-svelte-devtools/sqlite';
const consumer = process.cwd();
const token = randomUUID(); process.env.SVELTE_DEVTOOLS_TOKEN = token;
const results = [];
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
for (const name of Object.keys(manifest.dependencies).filter(name => name.startsWith('@fsodano/'))) assert.equal(lstatSync(join('node_modules', name)).isSymbolicLink(), false, name + ' must be a tarball install');
const marker = {}; assert.equal(traceSqliteQuery({ enabled: false, database: 'consumer', operation: 'get' }, () => marker), marker);
for (const app of ['plain', 'kit']) {
 const root = join(consumer, app);
 process.chdir(root);
 const server = await createServer({ root, server: { host: '127.0.0.1', port: 5190, strictPort: true } });
 try {
  await server.listen();
  for (const path of ['/', '/__svelte-devtools/', '/__svelte-devtools/svelte-runtime.js', '/__svelte-devtools/api/']) {
   const response = await fetch('http://127.0.0.1:5190' + path, { headers: { Authorization: 'Bearer ' + token } });
   const body = await response.text(); assert.equal(response.status, 200, app + path);
   if (path.endsWith('svelte-runtime.js')) { assert.match(response.headers.get('content-type'), /javascript/); assert.match(body, /handleState/); }
   if (path === '/__svelte-devtools/') {
    assert.match(body, /__SVELTE_DEVTOOLS_TOKEN__/);
    const asset = body.match(/src="([^"]+\.js)"/); assert.ok(asset, 'panel bundle link');
    const bundle = await fetch(new URL(asset[1], 'http://127.0.0.1:5190')); assert.equal(bundle.status, 200); assert.match(bundle.headers.get('content-type'), /javascript/);
   }
   if (path === '/' && app === 'kit') assert.match(body, /Consumer count 0/);
   if (path === '/__svelte-devtools/api/') assert.equal(JSON.parse(body).ok, true);
   results.push({ app, path, status: response.status, bytes: body.length });
  }
  const client = new Client({ name: 'packed-consumer', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: join(consumer, 'node_modules/.bin/svelte-devtools-mcp'), env: { ...process.env, SVELTE_DEVTOOLS_URL: 'http://127.0.0.1:5190', SVELTE_DEVTOOLS_TOKEN: token } });
  try {
   await client.connect(transport); const tools = await client.listTools(); assert.equal(tools.tools.length, 9);
   const status = await client.callTool({ name: 'svelte_status', arguments: {} }); assert.notEqual(status.isError, true);
   results.push({ app, mcpTools: tools.tools.length, sqliteExport: true });
  } finally { await client.close(); }
 } finally { await server.close(); }
 execFileSync(process.execPath, [join(consumer, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe', timeout: 120000 });
 if (app === 'plain') {
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8'); assert.doesNotMatch(html, /__svelte-devtools/);
 } else {
  const production = await preview({ root, preview: { host: '127.0.0.1', port: 5190, strictPort: true } });
  try { const response = await fetch('http://127.0.0.1:5190/'); const html = await response.text(); assert.equal(response.status, 200); assert.match(html, /Consumer count 0/); assert.doesNotMatch(html, /__svelte-devtools/); }
  finally { await new Promise((done, reject) => production.httpServer.close(error => error ? reject(error) : done())); }
 }
 results.push({ app, productionBuild: true });
}
writeFileSync(join(consumer, 'results.json'), JSON.stringify(results, null, 2));
`);
  write('smoke.log', run(process.execPath, ['smoke.mjs']));
  console.log(readFileSync(join(directory, 'results.json'), 'utf8'));
  console.log('Packed consumer passed: plain Vite, SvelteKit, runtime/panel assets, types, SQLite export, MCP executable and production builds.');
} catch (error) {
  write('failure.log', String(error.stderr ?? '') + '\n' + String(error.stdout ?? '') + '\n' + String(error));
  console.error(`Consumer verification failed. See ${directory}/failure.log`);
  process.exitCode = 1;
}
