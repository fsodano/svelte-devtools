#!/usr/bin/env node
/**
 * release-check.mjs — publish-safety gate for the Svelte DevTools monorepo.
 *
 * For every publishable workspace this script:
 *   1. Scans the manifest's dependency sections (dependencies, devDependencies,
 *      peerDependencies, optionalDependencies) for `file:` or `workspace:`
 *      specifiers and fails hard if any survive.
 *   2. Runs `npm pack --dry-run --workspace <name> --json` to prove the package
 *      packs cleanly. The dry run writes no tarball and touches no manifests,
 *      so no user file is created or deleted.
 *
 * Metadata, licenses, READMEs, exported files, and release versions are also checked.
 *
 * Publishable packages must carry registry-safe plain semver ranges in their
 * published manifests. `file:` paths resolve to nothing on a consumer machine,
 * and npm does not understand the `workspace:` protocol at all — a tarball with
 * either specifier is unpublishable in practice.
 *
 * Exit code is 0 only when every publishable package passes both steps.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const UNSAFE_SPEC = /^(file:|workspace:)/;
const manifests = new Map();
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const manifest = JSON.parse(readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8'));
    if (!manifest.private) manifests.set(manifest.name, { dir: entry.name, manifest });
  } catch { /* Ignore directories without package manifests. */ }
}
const PUBLISHABLE = [];
const visiting = new Set();
function visit(name) {
  if (PUBLISHABLE.includes(name)) return;
  if (visiting.has(name)) throw new Error(`Circular publish dependency: ${name}`);
  visiting.add(name);
  const { manifest } = manifests.get(name);
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
    if (manifests.has(dependency)) visit(dependency);
  }
  visiting.delete(name);
  PUBLISHABLE.push(name);
}
for (const name of manifests.keys()) visit(name);
if (process.argv.includes('--list')) {
  console.log(PUBLISHABLE.join('\n'));
  process.exit(0);
}

let failed = false;
const { DEVTOOLS_VERSION } = await import('../packages/types/dist/index.js');
if (DEVTOOLS_VERSION !== JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version) {
  console.error('Shared runtime version differs from release manifest; update constants.ts and rebuild.');
  failed = true;
}

for (const name of PUBLISHABLE) {
  const { manifest, dir } = manifests.get(name);
  const metadata = ['description', 'license', 'homepage', 'bugs', 'repository'];
  for (const field of metadata) {
    if (!manifest[field]) { console.error(`✗ ${name}: missing ${field}`); failed = true; }
  }
  const releaseVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  if (manifest.version !== releaseVersion) { console.error(`✗ ${name}: version differs from release ${releaseVersion}`); failed = true; }
  for (const [dependency, spec] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (manifests.has(dependency) && spec !== `^${manifests.get(dependency).manifest.version}`) {
      console.error(`✗ ${name}: internal dependency ${dependency} does not match this release`); failed = true;
    }
  }

  // Step 1 — manifest scan for file:/workspace: specifiers.
  const unsafe = [];
  for (const section of DEP_SECTIONS) {
    for (const [dep, spec] of Object.entries(manifest[section] ?? {})) {
      if (typeof spec === 'string' && UNSAFE_SPEC.test(spec)) {
        unsafe.push(`${section}.${dep}: "${spec}"`);
      }
    }
  }
  if (unsafe.length > 0) {
    console.error(`✗ ${name}: unsafe dependency specifiers found`);
    for (const line of unsafe) console.error(`    ${line}`);
    failed = true;
  } else {
    console.log(`✓ ${name}: manifest dependencies are registry-safe (plain semver)`);
  }

  // Step 2 — prove the workspace packs cleanly. Non-interactive; no tarball written.
  try {
    const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--workspace', name, '--json'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }))[0];
    const files = new Set(packed.files.map(file => file.path));
    const exportTargets = value => typeof value === 'string' ? [value]
      : value && typeof value === 'object' ? Object.values(value).flatMap(exportTargets) : [];
    const entries = [manifest.main, manifest.types, ...exportTargets(manifest.exports), ...Object.values(typeof manifest.bin === 'object' ? manifest.bin : { bin: manifest.bin })].filter(Boolean);
    for (const entry of entries) {
      if (!files.has(entry.replace(/^\.\//, ''))) throw new Error(`Packed entry point is missing: ${entry}`);
    }
    if (!packed.files.some(file => file.path.startsWith('dist/'))) throw new Error('Package contains no built dist files');
    for (const required of ['README.md', 'LICENSE']) {
      if (!files.has(required)) throw new Error(`Package is missing ${required}`);
      if (!readFileSync(join(packagesDir, dir, required), 'utf8').trim()) throw new Error(`${required} is empty`);
    }
    if (readFileSync(join(packagesDir, dir, 'LICENSE'), 'utf8') !== readFileSync(join(root, 'LICENSE'), 'utf8')) throw new Error('Package license differs from repository license');
    console.log(`✓ ${name}: npm pack --dry-run passed`);
  } catch (err) {
    console.error(`✗ ${name}: npm pack --dry-run failed`);
    console.error(String(err.stderr ?? err.message).trim());
    failed = true;
  }
}

if (failed) {
  console.error('\nrelease:check FAILED — fix package metadata, contents, or dependency versions before publishing.');
  process.exit(1);
}
console.log('\nrelease:check passed — every publishable package is pack-safe.');
