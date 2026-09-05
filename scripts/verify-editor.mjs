import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Exercise the real launch-editor integration using a local recorder as the editor.
const directory = mkdtempSync(join(tmpdir(), 'svelte-devtools-editor-'));
const output = join(directory, 'arguments.json');
const editor = join(directory, 'record-editor');
writeFileSync(editor, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
const root = resolve('tests/apps/svelte');
const token = 'local-editor-verification-token';
const server = spawn(join(root, 'node_modules/.bin/vite'), ['--port', '5177', '--strictPort', '--clearScreen', 'false'], {
  cwd: root, env: { ...process.env, SVELTE_DEVTOOLS_TOKEN: token, LAUNCH_EDITOR: editor }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', chunk => log += chunk);
server.stderr.on('data', chunk => log += chunk);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await fetch('http://localhost:5177/')).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  assert(ready, 'Editor fixture did not start');
  const file = join(root, 'src/App.svelte');
  const request = body => fetch('http://localhost:5177/__svelte-devtools/open-in-editor', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const response = await request({ file, line: 3, column: 2 });
  assert.equal(response.status, 200, await response.text());
  for (let attempt = 0; attempt < 50 && !existsSync(output); attempt++) await sleep(100);
  assert(existsSync(output), 'Editor command was not launched');
  const args = JSON.parse(readFileSync(output, 'utf8'));
  assert(args.includes(file), `Editor did not receive source path: ${JSON.stringify(args)}`);
  assert(args.includes('3'), `Editor did not receive line: ${JSON.stringify(args)}`);
  assert(args.includes('2'), `Editor did not receive column: ${JSON.stringify(args)}`);
  assert.equal((await request({ file: '../../../package.json' })).status, 400);
  assert.equal((await request({ file: 'missing.svelte' })).status, 400);
  console.log('Editor integration passed: real server launched configured editor with source path and line; rejected outside/missing paths.');
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
  rmSync(directory, { recursive: true, force: true });
}
